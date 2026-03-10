/**
 * Seller RFQ Feed API
 * Returns all RFQs visible to the authenticated seller (based on categories)
 * 
 * This is the seller's "feed" - RFQs they can bid on
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
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

    // CRITICAL: Resolve supplier ID from SupplierMember (org-scoped)
    const prisma = getPrisma();
    
    // Find ACTIVE SupplierMember for this user to resolve supplierId
    const membership = await prisma.supplierMember.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      select: {
        supplierId: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!membership) {
      return jsonError(
        "FORBIDDEN",
        "Your seller account is not attached to an active supplier organization. Please contact support.",
        403
      );
    }

    const sellerSupplierId = membership.supplierId;

    // Get categories from SupplierCategoryLink (org-scoped, canonical source)
    const categoryLinks = await prisma.supplierCategoryLink.findMany({
      where: { supplierId: sellerSupplierId },
      select: { categoryId: true },
    });

    let sellerCategoryIds: string[] = categoryLinks.map((link: { categoryId: string }) => link.categoryId);

    // Legacy fallback: if no category links exist, try parsing User.categoriesServed
    // This supports old accounts that haven't been migrated yet
    if (sellerCategoryIds.length === 0) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { categoriesServed: true },
      });

      try {
        if (dbUser?.categoriesServed) {
          const parsed = JSON.parse(dbUser.categoriesServed);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sellerCategoryIds = parsed;
            // Log fallback usage for migration tracking
            console.log("[SELLER_FEED_LEGACY_CATEGORIES]", {
              sellerUserId: user.id,
              supplierId: sellerSupplierId,
              legacyCategories: sellerCategoryIds,
            });
          }
        }
      } catch {
        // Invalid JSON, treat as empty
      }
    }

    // sellerCategoryIds now contains the canonical category IDs for this supplier org

    // CRITICAL: Only return OPEN RFQs (not PUBLISHED, DRAFT, etc.)
    // Filter by visibility and category:
    // - broadcast: show if seller's categoriesServed includes RFQ.category
    // - direct: show if seller's supplier org ID is in RFQ.targetSupplierIds (regardless of category)
    
    // Normalize seller categories for matching (CategoryId-first, label fallback)
    const sellerCategoriesTrimmed = sellerCategoryIds.length > 0
      ? sellerCategoryIds.map((cat: string) => String(cat).trim())
      : [];

    const sellerCategoriesLower = sellerCategoriesTrimmed.map((cat: string) => cat.toLowerCase());

    // Get visibility filter from query param (if provided)
    const visParam = new URL(request.url).searchParams.get("visibility");
    const countOnly = new URL(request.url).searchParams.get("count") === "true";
    
    // Build Prisma query: fetch OPEN RFQs that could be visible to this seller
    // 🚨 CRITICAL: Filter by visibility at database level to prevent direct RFQs from entering broadcast feed
    const whereClause: any = {
      status: "OPEN", // CRITICAL: Only OPEN RFQs
    };
    
    // CRITICAL: Default behavior is to return ONLY broadcast RFQs (live feed)
    // Direct RFQs should never appear in the live feed unless explicitly requested
    if (visParam === "direct") {
      // If visibility=direct, only return direct RFQs (must be explicitly "direct")
      whereClause.visibility = "direct";
    } else {
      // Default: Only return broadcast RFQs (explicit "broadcast" or null/undefined for legacy)
      // This ensures DIRECT RFQs never appear on the live feed
      whereClause.OR = [
        { visibility: "broadcast" },
        { visibility: null }, // Legacy RFQs without visibility field default to broadcast
      ];
    }

    // Query OPEN RFQs with visibility filter applied at database level
    const dbRfqs = await prisma.rFQ.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // Pre-fetch legacy user ID mappings for compatibility fallback
    // Collect all targetSupplierIds from direct RFQs to batch-check for legacy user IDs
    const directRfqs = dbRfqs.filter(rfq => (rfq.visibility || "broadcast") === "direct" && rfq.targetSupplierIds);
    const allTargetIds = new Set<string>();
    for (const rfq of directRfqs) {
      try {
        const targetIds = JSON.parse(rfq.targetSupplierIds || "[]");
        if (Array.isArray(targetIds)) {
          targetIds.forEach((id: string) => allTargetIds.add(id));
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Batch-check which target IDs are user IDs that map to this supplier org
    const legacyUserIds: string[] = [];
    if (allTargetIds.size > 0 && sellerSupplierId) {
      const matchingMembers = await prisma.supplierMember.findMany({
        where: {
          userId: { in: Array.from(allTargetIds) },
          supplierId: sellerSupplierId,
          status: "ACTIVE",
        },
        select: { userId: true },
      });
      legacyUserIds.push(...matchingMembers.map((m: { userId: string }) => m.userId));
    }

    // Filter RFQs visible to this seller
    let visibleRfqs = dbRfqs.filter(rfq => {
      const visibility = rfq.visibility || "broadcast"; // Default to broadcast
      
      if (visibility === "direct") {
        // Direct RFQ: only show if seller's supplier org ID is in targetSupplierIds (ignore category)
        // CRITICAL: targetSupplierIds contains SUPPLIER ORGANIZATION IDs, not seller user IDs
        if (!sellerSupplierId) {
          return false; // No supplier org ID = cannot see direct RFQs
        }
        if (!rfq.targetSupplierIds) {
          return false; // Direct RFQ with no targets = not visible
        }
        try {
          const targetIds = JSON.parse(rfq.targetSupplierIds);
          if (!Array.isArray(targetIds)) {
            return false;
          }
          
          // PRIMARY CHECK: Match using supplier org ID (canonical format)
          if (targetIds.includes(sellerSupplierId)) {
            return true;
          }

          // COMPATIBILITY FALLBACK: Check if any target IDs are legacy user IDs that map to this org
          const hasLegacyMatch = targetIds.some((id: string) => legacyUserIds.includes(id));
          if (hasLegacyMatch) {
            // Legacy record detected - log for migration tracking
            console.log("[SELLER_FEED_LEGACY_DIRECT_RFQ]", {
              rfqId: rfq.id,
              sellerUserId: user.id,
              supplierId: sellerSupplierId,
              legacyUserIds: targetIds.filter((id: string) => legacyUserIds.includes(id)),
            });
            return true;
          }

          return false; // No match found
        } catch {
          return false; // Invalid JSON = not visible
        }
      } else if (visibility === "broadcast") {
        // Broadcast RFQ: show if supplier org's categories include RFQ.categoryId (or category label as fallback)
        if (!rfq.category && !(rfq as any).categoryId) {
          return false; // Broadcast RFQ must have a category or categoryId
        }
        if (sellerCategoriesTrimmed.length === 0) {
          return false; // Supplier org has no categories = can't see broadcast RFQs
        }
        const rfqCategoryId = (rfq as any).categoryId ? String((rfq as any).categoryId).trim() : "";
        const rfqCategoryLabelLower = String(rfq.category || "").toLowerCase().trim();

        // Match CategoryId first (canonical)
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
    
    // CRITICAL: Exclude RFQs that the seller has already bid on
    // The feed should only show RFQs the seller can still act on
    const visibleRfqIds = visibleRfqs.map(r => r.id);
    
    if (visibleRfqIds.length > 0) {
      const existingBids = await prisma.bid.findMany({
        where: {
          sellerId: user.id,
          rfqId: { in: visibleRfqIds },
        },
        select: { rfqId: true },
      });
      
      const bidRfqIdSet = new Set(existingBids.map(b => b.rfqId));
      visibleRfqs = visibleRfqs.filter(rfq => !bidRfqIdSet.has(rfq.id));
    }
    
    // CRITICAL: Log seller feed query (always, not just dev)
    const broadcastCount = visibleRfqs.filter(r => (r.visibility || "broadcast") === "broadcast").length;
    const directCount = visibleRfqs.filter(r => r.visibility === "direct").length;
    
    console.log("[SELLER_FEED_QUERY]", {
      sellerUserId: user.id,
      supplierId: sellerSupplierId,
      supplierName: membership.supplier.name,
      visibilityParam: visParam || "default",
      sellerCategoryIds: sellerCategoryIds,
      totalOpenRfqs: dbRfqs.length,
      visibleCount: visibleRfqs.length,
      directCount,
      broadcastCount,
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
      sellerUserId: user.id,
      supplierId: sellerSupplierId,
      count: summaryRfqs.length,
      sellerCategoryIds,
    });

    // If count-only mode, return just the count
    if (countOnly) {
      return NextResponse.json(
        { ok: true, count: visibleRfqs.length },
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
    }

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

