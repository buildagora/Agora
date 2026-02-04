/**
 * Seller RFQ Detail API
 * Returns a single RFQ by ID for the authenticated seller
 * Server-side, single source of truth from database
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
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

    const { rfqId: id } = await params;

    // Query RFQ from database (server-side, single source of truth)
    const prisma = getPrisma();
    
    // Check if seller has a bid for this RFQ (allows access regardless of status/visibility)
    const sellerBid = await prisma.bid.findFirst({
      where: {
        rfqId: id,
        sellerId: user.id,
      },
      select: {
        id: true,
        status: true,
      },
    });
    
    // Fetch RFQ
    const dbRfq = await prisma.rFQ.findFirst({
      where: { id: id },
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Parse JSON fields from database
    let lineItems: any[] = [];
    let terms: any = {};
    let targetSupplierIds: string[] = [];

    try {
      lineItems = dbRfq.lineItems ? JSON.parse(dbRfq.lineItems) : [];
    } catch {
      lineItems = [];
    }

    try {
      terms = dbRfq.terms ? JSON.parse(dbRfq.terms) : {};
    } catch {
      terms = {};
    }

    try {
      targetSupplierIds = dbRfq.targetSupplierIds ? JSON.parse(dbRfq.targetSupplierIds) : [];
    } catch {
      targetSupplierIds = [];
    }

    // CRITICAL: Check visibility access if seller has no bid
    // Seller should be able to access RFQ if:
    // 1. They submitted a bid for it (already checked above), OR
    // 2. RFQ is broadcast AND seller's categories match, OR
    // 3. RFQ is direct AND seller is in targetSupplierIds
    if (!sellerBid) {
      // No bid yet - check visibility and status
      if (dbRfq.status !== "OPEN") {
        return jsonError("NOT_FOUND", "RFQ not found", 404);
      }

      const visibility = dbRfq.visibility || "broadcast";
      
      if (visibility === "direct") {
        // Direct RFQ: only show if seller is in targetSupplierIds
        if (!targetSupplierIds.includes(user.id)) {
          return jsonError("FORBIDDEN", "RFQ not available", 403);
        }
      } else if (visibility === "broadcast") {
        // Broadcast RFQ: check if seller's categories match
        // Get seller's categories from database
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { categoriesServed: true },
        });

        let sellerCategories: string[] = [];
        try {
          if (dbUser?.categoriesServed) {
            sellerCategories = JSON.parse(dbUser.categoriesServed);
          }
        } catch {
          // Invalid JSON, treat as empty
        }

        const sellerCategoriesTrimmed = sellerCategories.length > 0
          ? sellerCategories.map(cat => String(cat).trim())
          : [];
        const sellerCategoriesLower = sellerCategoriesTrimmed.map(cat => cat.toLowerCase());

        // Check category match
        const rfqCategoryId = dbRfq.categoryId ? String(dbRfq.categoryId).trim() : "";
        const rfqCategoryLabelLower = String(dbRfq.category || "").toLowerCase().trim();

        const categoryMatch = 
          (rfqCategoryId && sellerCategoriesTrimmed.includes(rfqCategoryId)) ||
          (rfqCategoryLabelLower && sellerCategoriesLower.includes(rfqCategoryLabelLower));

        if (!categoryMatch) {
          return jsonError("FORBIDDEN", "RFQ not available", 403);
        }
      }
    }

    // Return RFQ in expected format
    const rfq = {
      id: dbRfq.id,
      rfqNumber: dbRfq.rfqNumber,
      status: dbRfq.status,
      createdAt: dbRfq.createdAt.toISOString(),
      title: dbRfq.title,
      notes: dbRfq.notes || "",
      category: dbRfq.category,
      categoryId: dbRfq.categoryId || null,
      buyerId: dbRfq.buyerId,
      jobNameOrPo: dbRfq.jobNameOrPo || null,
      visibility: dbRfq.visibility as "broadcast" | "direct" | undefined,
      targetSupplierIds,
      lineItems,
      terms,
      awardedBidId: dbRfq.awardedBidId || null,
      awardedAt: dbRfq.awardedAt?.toISOString() || null,
    };

    return jsonOk(rfq, 200);
  });
}

