/**
 * Buyer RFQ Award API
 * Awards a bid and creates an order
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { getSellerDisplayName } from "@/lib/sellers/displayName";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AwardBidSchema = z.object({
  winningBidId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  return withErrorHandling(async () => {
    // CRITICAL: Log API hit (always, not just dev)
    const { rfqId } = await params;
    console.log("[RFQ_AWARD_API_HIT]", {
      rfqId,
      buyerId: "pending",
      winningBidId: "pending",
    });

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

    // Update log with actual buyerId
    console.log("[RFQ_AWARD_API_HIT]", {
      rfqId,
      buyerId: user.id,
      winningBidId: "pending",
    });

    // Parse and validate body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const validation = AwardBidSchema.safeParse(body);
    if (!validation.success) {
      return jsonError("BAD_REQUEST", "Invalid award data", 400, validation.error.issues);
    }

    const { winningBidId } = validation.data;

    // Update log with winningBidId
    console.log("[RFQ_AWARD_API_HIT]", {
      rfqId,
      buyerId: user.id,
      winningBidId,
    });

    const prisma = getPrisma();

    // Verify RFQ exists and belongs to buyer
    const dbRfq = await prisma.rFQ.findFirst({
      where: {
        id: rfqId,
        buyerId: user.id,
      },
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            fullName: true,
            companyName: true,
          },
        },
      },
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Verify bid exists and belongs to this RFQ
    const dbBid = await prisma.bid.findFirst({
      where: {
        id: winningBidId,
        rfqId: rfqId,
      },
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            fullName: true,
            companyName: true,
          },
        },
      },
    });

    if (!dbBid) {
      return jsonError("NOT_FOUND", "Bid not found for this RFQ", 404);
    }

    // Update RFQ status and awarded bid
    await prisma.rFQ.update({
      where: { id: rfqId },
      data: {
        status: "AWARDED",
        awardedBidId: winningBidId,
        awardedAt: new Date(),
      },
    });

    // Update bid status
    await prisma.bid.update({
      where: { id: winningBidId },
      data: {
        status: "WON",
      },
    });

    // Parse RFQ terms for order creation
    let terms: any = {};
    try {
      terms = dbRfq.terms ? JSON.parse(dbRfq.terms) : {};
    } catch {
      terms = {};
    }

    let lineItems: any[] = [];
    try {
      lineItems = dbBid.lineItems ? JSON.parse(dbBid.lineItems) : [];
    } catch {
      lineItems = [];
    }

    // Create Order
    const order = await prisma.order.create({
      data: {
        buyerId: user.id,
        rfqId: rfqId,
        bidId: winningBidId,
        status: "pending",
        lineItems: JSON.stringify(lineItems),
        subtotal: dbBid.total || 0,
        taxes: 0, // Can be calculated later
        total: dbBid.total || 0,
        fulfillmentType: terms.fulfillmentType || "PICKUP",
        requestedDate: terms.requestedDate || new Date().toISOString().split("T")[0],
        deliveryPreference: terms.deliveryPreference || null,
        deliveryInstructions: terms.deliveryInstructions || null,
        location: terms.location || null,
        notes: dbBid.notes || null,
      },
    });

    // CRITICAL: Log award creation
    console.log("[RFQ_AWARD_DB_OK]", {
      rfqId,
      winningBidId,
      orderId: order.id,
    });

    // Trigger notifications (in-process, awaited)
    console.log("[RFQ_AWARD_NOTIFY_START]", {
      rfqId,
      bidId: winningBidId,
      orderId: order.id,
    });

    try {
      // Compute seller display name using canonical helper
      const sellerDisplayName = getSellerDisplayName({
        user: {
          id: dbBid.seller.id,
          email: dbBid.seller.email,
          fullName: dbBid.seller.fullName,
          companyName: dbBid.seller.companyName,
        },
        sellerProfile: null,
      });
      
      // Compute buyer display name (for notifications)
      const buyerDisplayName = getSellerDisplayName({
        user: {
          id: dbRfq.buyer.id,
          email: dbRfq.buyer.email,
          fullName: dbRfq.buyer.fullName,
          companyName: dbRfq.buyer.companyName,
        },
        sellerProfile: null,
      });
      
      // Notify seller (award made)
      const { notifySellerOfAward } = await import("@/lib/bids/notifySellerOfAward.server");
      const sellerStats = await notifySellerOfAward({
        rfqId,
        rfqNumber: dbRfq.rfqNumber,
        rfqTitle: dbRfq.title,
        bidId: winningBidId,
        orderId: order.id,
        sellerId: dbBid.sellerId,
        sellerEmail: dbBid.seller.email,
        sellerName: sellerDisplayName,
        buyerName: buyerDisplayName,
        bidTotal: dbBid.total || 0,
      });

      // Notify buyer (confirmation)
      const { notifyBuyerOfAward } = await import("@/lib/bids/notifyBuyerOfAward.server");
      const buyerStats = await notifyBuyerOfAward({
        rfqId,
        rfqNumber: dbRfq.rfqNumber,
        rfqTitle: dbRfq.title,
        orderId: order.id,
        buyerId: user.id,
        buyerEmail: dbRfq.buyer.email,
        buyerName: buyerDisplayName,
        sellerName: sellerDisplayName,
        bidTotal: dbBid.total || 0,
      });

      console.log("[RFQ_AWARD_NOTIFY_DONE]", {
        rfqId,
        attempted: sellerStats.attempted + buyerStats.attempted,
        sent: sellerStats.sent + buyerStats.sent,
        errors: sellerStats.errors + buyerStats.errors,
      });
    } catch (error) {
      console.error("[RFQ_AWARD_NOTIFY_FAILED]", {
        rfqId,
        error: String(error),
      });
    }

    return jsonOk({
      ok: true,
      order: {
        id: order.id,
        rfqId: order.rfqId,
        bidId: order.bidId,
        status: order.status,
        total: order.total,
      },
    }, 201);
  });
}

