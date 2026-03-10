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
      
      // CRITICAL: Resolve supplier ID from SupplierMember (org-scoped)
      const membership = await prisma.supplierMember.findFirst({
        where: {
          userId: user.id,
          status: "ACTIVE",
        },
        select: {
          supplierId: true,
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

      if (visibility === "direct") {
        // Direct RFQ: only show if seller's supplier org is in targetSupplierIds
        // CRITICAL: targetSupplierIds contains SUPPLIER ORGANIZATION IDs, not seller user IDs
        if (targetSupplierIds.includes(sellerSupplierId)) {
          // Primary check passed - org ID match
        } else {
          // COMPATIBILITY FALLBACK: Handle legacy records that contain seller user IDs
          // Check if any target IDs are seller user IDs that map to this org
          const matchingMembers = await prisma.supplierMember.findMany({
            where: {
              userId: { in: targetSupplierIds },
              supplierId: sellerSupplierId,
              status: "ACTIVE",
            },
            select: { userId: true },
          });

          if (matchingMembers.length === 0) {
            // No match found (neither org ID nor legacy user ID)
            return jsonError("FORBIDDEN", "RFQ not available", 403);
          }

          // Legacy record detected - log for migration tracking
          console.log("[SELLER_RFQ_DETAIL_LEGACY_DIRECT_RFQ]", {
            rfqId: id,
            sellerUserId: user.id,
            supplierId: sellerSupplierId,
            legacyUserIds: matchingMembers.map(m => m.userId),
          });
        }
      } else if (visibility === "broadcast") {
        // Broadcast RFQ: check if supplier org's categories match
        // Get categories from SupplierCategoryLink (org-scoped, canonical source)
        const categoryLinks = await prisma.supplierCategoryLink.findMany({
          where: { supplierId: sellerSupplierId },
          select: { categoryId: true },
        });

        let sellerCategoryIds: string[] = categoryLinks.map((link: { categoryId: string }) => link.categoryId);

        // Legacy fallback: if no category links exist, try parsing User.categoriesServed
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
              }
            }
          } catch {
            // Invalid JSON, treat as empty
          }
        }

        const sellerCategoriesTrimmed = sellerCategoryIds.length > 0
          ? sellerCategoryIds.map((cat: string) => String(cat).trim())
          : [];
        const sellerCategoriesLower = sellerCategoriesTrimmed.map((cat: string) => cat.toLowerCase());

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

