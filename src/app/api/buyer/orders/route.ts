/**
 * Buyer Orders API
 * Returns all orders for the authenticated buyer
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

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Support optional rfqId filter
    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfqId");

    // Query orders from database with buyer relation
    const prisma = getPrisma();
    const dbOrders = await prisma.order.findMany({
      where: {
        buyerId: user.id,
        ...(rfqId && { rfqId }),
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

    // Fetch bids separately to get seller info (Order doesn't have bid relation)
    const bidIds = dbOrders.map((o) => o.bidId).filter((id): id is string => Boolean(id));
    const bids = bidIds.length > 0
      ? await prisma.bid.findMany({
          where: { id: { in: bidIds } },
          include: {
            seller: {
              select: {
                id: true,
                fullName: true,
                companyName: true,
                email: true,
              },
            },
          },
        })
      : [];

    // Build bidById map for quick lookup
    const bidById = new Map(bids.map((bid) => [bid.id, bid]));

    // Parse JSON fields and return with buyer/seller info
    const orders = dbOrders.map(order => {
      const bid = order.bidId ? bidById.get(order.bidId) : null;
      const buyerName = order.buyer?.fullName || order.buyer?.companyName || order.buyer?.email || "Buyer";
      const buyerPhone = order.buyer?.phone || null;
      const sellerName = bid?.seller?.fullName || bid?.seller?.companyName || bid?.seller?.email || "Seller";
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

