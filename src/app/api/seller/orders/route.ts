/**
 * Seller Orders API
 * Returns all orders for the authenticated seller (orders tied to seller's bids)
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

    // Support optional rfqId filter
    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfqId");

    const prisma = getPrisma();

    // Step 1: Find seller's bid IDs (optionally filtered by rfqId)
    const sellerBids = await prisma.bid.findMany({
      where: {
        sellerId: user.id,
        ...(rfqId ? { rfqId } : {}),
      },
      select: { id: true, rfqId: true },
    });

    if (sellerBids.length === 0) {
      return jsonOk([], 200);
    }

    // Step 2: Build array of bidIds
    const sellerBidIds = sellerBids.map((bid) => bid.id);

    // Step 3: Query orders where bidId matches seller's bid IDs, include buyer relation
    const dbOrders = await prisma.order.findMany({
      where: {
        bidId: {
          in: sellerBidIds,
        },
      },
      include: {
        buyer: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Step 4: Parse JSON fields and return with buyer/seller info
    const sellerName = user.fullName || user.companyName || user.email || "Seller";
    const orders = dbOrders.map((order) => {
      const buyerName = order.buyer?.fullName || order.buyer?.companyName || order.buyer?.email || "Buyer";
      const buyerPhone = order.buyer?.phone || null;
      const orderNumber = `PO-${order.id.slice(0, 8).toUpperCase()}`;

      return {
        id: order.id,
        rfqId: order.rfqId,
        bidId: order.bidId,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        lineItems: order.lineItems ? JSON.parse(order.lineItems) : [],
        subtotal: order.subtotal,
        taxes: order.taxes,
        total: order.total,
        fulfillmentType: order.fulfillmentType,
        requestedDate: order.requestedDate,
        deliveryPreference: order.deliveryPreference,
        deliveryInstructions: order.deliveryInstructions,
        location: order.location,
        notes: order.notes,
        buyerName,
        buyerPhone,
        sellerName,
        orderNumber,
      };
    });

    return jsonOk(orders, 200);
  });
}

