/**
 * Buyer Bids API
 * Returns all bids for RFQs owned by the authenticated buyer
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { getSellerDisplayName } from "@/lib/sellers/displayName";

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

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfqId");

    // CRITICAL: Log API hit (always, not just dev)
    console.log("[BUYER_BIDS_API_HIT]", {
      buyerId: user.id,
      rfqId: rfqId || "all",
    });

    const prisma = getPrisma();

    // Build query: bids for RFQs owned by this buyer
    const whereClause: any = {
      rfq: {
        buyerId: user.id,
      },
    };

    // Filter by rfqId if provided
    if (rfqId) {
      whereClause.rfqId = rfqId;
    }

    // Query bids with seller info
    const dbBids = await prisma.bid.findMany({
      where: whereClause,
      include: {
        seller: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            email: true,
          },
        },
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // CRITICAL: Log bid count (always, not just dev)
    console.log("[BUYER_BIDS_DB_COUNT]", {
      rfqId: rfqId || "all",
      count: dbBids.length,
    });

    // Parse JSON fields and return with seller display fields
    const bids = dbBids.map((bid: any) => {
      // Use canonical getSellerDisplayName helper (never returns email in production)
      const sellerDisplayName = getSellerDisplayName({
        user: {
          id: bid.seller.id,
          email: bid.seller.email,
          fullName: bid.seller.fullName,
          companyName: bid.seller.companyName,
        },
        // No separate sellerProfile model yet - using user fields directly
        sellerProfile: null,
      });
      
      return {
        id: bid.id,
        rfqId: bid.rfqId,
        rfqNumber: bid.rfq.rfqNumber,
        rfqTitle: bid.rfq.title,
        sellerId: bid.sellerId,
        sellerName: sellerDisplayName, // Use computed display name (backward compatibility)
        sellerDisplayName, // Canonical field for UI
        sellerCompanyName: bid.seller.companyName || null,
        sellerEmail: bid.seller.email, // Keep for internal use, but UI should never display this
        createdAt: bid.createdAt.toISOString(),
        status: bid.status,
        lineItems: bid.lineItems ? JSON.parse(bid.lineItems) : [],
        notes: bid.notes,
        deliveryCharge: bid.deliveryCharge,
        total: bid.total,
        leadTimeDays: bid.leadTimeDays,
        seenByBuyerAt: bid.seenByBuyerAt?.toISOString() || null,
        seenBySellerAt: bid.seenBySellerAt?.toISOString() || null,
      };
    });

    return jsonOk(bids, 200);
  });
}

