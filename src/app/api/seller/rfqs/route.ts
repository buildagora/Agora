/**
 * Seller RFQ Feed API
 * Returns all RFQs visible to the authenticated seller (based on categories)
 * 
 * This is the seller's "feed" - RFQs they can bid on
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Get seller's categories from database
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { categoriesServed: true },
    });

    // Parse seller's categories
    let sellerCategories: string[] = [];
    try {
      if (dbUser?.categoriesServed) {
        sellerCategories = JSON.parse(dbUser.categoriesServed);
      }
    } catch {
      // Invalid JSON, treat as empty
    }

    // CRITICAL: Only return OPEN RFQs (not PUBLISHED, DRAFT, etc.)
    // Filter by visibility and category:
    // - broadcast: show if seller's categoriesServed includes RFQ.category
    // - direct: show if seller.id is in RFQ.targetSupplierIds (regardless of category)
    
    // Normalize seller categories for matching (CategoryId-first, label fallback)
    const sellerCategoriesTrimmed = sellerCategories.length > 0
      ? sellerCategories.map(cat => String(cat).trim())
      : [];

    const sellerCategoriesLower = sellerCategoriesTrimmed.map(cat => cat.toLowerCase());

    // Get visibility filter from query param (if provided)
    const visParam = new URL(request.url).searchParams.get("visibility");
    
    // Build Prisma query: fetch OPEN RFQs that could be visible to this seller
    // 🚨 CRITICAL: Filter by visibility at database level to prevent direct RFQs from entering broadcast feed
    const whereClause: any = {
      status: "OPEN", // CRITICAL: Only OPEN RFQs
    };
    
    // HARD FILTER: If visibility=broadcast, exclude direct RFQs at database level
    if (visParam === "broadcast") {
      // Only return broadcast RFQs (explicit "broadcast" or null/undefined for legacy)
      whereClause.OR = [
        { visibility: "broadcast" },
        { visibility: null }, // Legacy RFQs without visibility field default to broadcast
      ];
    } else if (visParam === "direct") {
      // If visibility=direct, only return direct RFQs (must be explicitly "direct")
      whereClause.visibility = "direct";
    }
    // If no visibility param, return both (backward compatibility - no filter)

    // Query OPEN RFQs with visibility filter applied at database level
    const dbRfqs = await prisma.rFQ.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // Filter RFQs visible to this seller
    let visibleRfqs = dbRfqs.filter(rfq => {
      const visibility = rfq.visibility || "broadcast"; // Default to broadcast
      
      if (visibility === "direct") {
        // Direct RFQ: only show if seller is in targetSupplierIds (ignore category)
        if (!rfq.targetSupplierIds) {
          return false; // Direct RFQ with no targets = not visible
        }
        try {
          const targetIds = JSON.parse(rfq.targetSupplierIds);
          if (!Array.isArray(targetIds)) {
            return false;
          }
          return targetIds.includes(user.id);
        } catch {
          return false; // Invalid JSON = not visible
        }
      } else if (visibility === "broadcast") {
        // Broadcast RFQ: show if seller's categoriesServed includes RFQ.categoryId (or category label as fallback)
        if (!rfq.category && !(rfq as any).categoryId) {
          return false; // Broadcast RFQ must have a category or categoryId
        }
        if (sellerCategoriesTrimmed.length === 0) {
          return false; // Seller has no categories = can't see broadcast RFQs
        }
        const rfqCategoryId = (rfq as any).categoryId ? String((rfq as any).categoryId).trim() : "";
        const rfqCategoryLabelLower = String(rfq.category || "").toLowerCase().trim();

        // Match CategoryId (new foundation)
        if (rfqCategoryId && sellerCategoriesTrimmed.includes(rfqCategoryId)) return true;

        // Fallback match by label (legacy)
        if (rfqCategoryLabelLower && sellerCategoriesLower.includes(rfqCategoryLabelLower)) return true;

        return false;
      }
      
      return false; // Unknown visibility = not visible
    });

    // Note: Visibility filter is already applied at database level above
    // This in-memory filter is now redundant but kept for backward compatibility
    // when no visibility param is provided
    
    // CRITICAL: Log seller feed query (always, not just dev)
    const broadcastCount = visibleRfqs.filter(r => (r.visibility || "broadcast") === "broadcast").length;
    const directCount = visibleRfqs.filter(r => r.visibility === "direct").length;
    
    console.log("[SELLER_FEED_QUERY]", {
      sellerId: user.id,
      sellerCategoryIds: sellerCategories,
      totalOpenRfqs: dbRfqs.length,
      visibleCount: visibleRfqs.length,
      broadcastCount,
      directCount,
    });

    // Return array with summary fields
    // Gracefully handle empty state (return empty array, not error)
    const summaryRfqs = visibleRfqs.map(rfq => ({
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      status: rfq.status,
      createdAt: rfq.createdAt.toISOString(),
      title: rfq.title,
      category: rfq.category,
      jobNameOrPo: rfq.jobNameOrPo || null,
      buyerId: rfq.buyerId,
      visibility: rfq.visibility || "broadcast",
      targetSupplierIds: rfq.targetSupplierIds ? JSON.parse(rfq.targetSupplierIds) : null,
    }));

    // CRITICAL: Log feed count for diagnostics
    console.log("[SELLER_FEED_COUNT]", {
      sellerId: user.id,
      count: summaryRfqs.length,
      sellerCategories,
    });

    // CRITICAL: Never cache seller feed - always return fresh data
    return NextResponse.json(
      { ok: true, data: summaryRfqs },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    ) as any;
  });
}

