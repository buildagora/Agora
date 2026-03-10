/**
 * Seller Bids API
 * Returns all bids for the authenticated seller
 */

import { NextRequest } from "next/server";
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

    // Query bids from database with RFQ relation for summary fields
    const prisma = getPrisma();
    const dbBids = await prisma.bid.findMany({
      where: { sellerId: user.id },
      include: {
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            title: true,
            category: true,
            categoryId: true,
            jobNameOrPo: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Parse JSON fields and return with RFQ summary
    const bids = dbBids.map((bid: any) => ({
      id: bid.id,
      rfqId: bid.rfqId,
      sellerId: bid.sellerId,
      createdAt: bid.createdAt.toISOString(),
      status: bid.status,
      lineItems: bid.lineItems ? JSON.parse(bid.lineItems) : [],
      notes: bid.notes,
      deliveryCharge: bid.deliveryCharge,
      total: bid.total,
      leadTimeDays: bid.leadTimeDays,
      seenByBuyerAt: bid.seenByBuyerAt?.toISOString() || null,
      seenBySellerAt: bid.seenBySellerAt?.toISOString() || null,
      // Include RFQ summary fields for dashboard display
      rfq: bid.rfq ? {
        id: bid.rfq.id,
        rfqNumber: bid.rfq.rfqNumber,
        title: bid.rfq.title,
        category: bid.rfq.category,
        categoryId: bid.rfq.categoryId,
        jobNameOrPo: bid.rfq.jobNameOrPo,
        status: bid.rfq.status,
      } : null,
    }));

    return jsonOk(bids, 200);
  });
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const { markSeen } = body;

    if (markSeen !== true) {
      return jsonError("BAD_REQUEST", "markSeen=true required", 400);
    }

    // Update bids in database
    const prisma = getPrisma();
    const now = new Date();
    
    await prisma.bid.updateMany({
      where: {
        sellerId: user.id,
        seenBySellerAt: null, // Only update unseen bids
      },
      data: {
        seenBySellerAt: now,
      },
    });

    return jsonOk({ success: true }, 200);
  });
}

