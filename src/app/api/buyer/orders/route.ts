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

    // Query orders from database
    const prisma = getPrisma();
    const dbOrders = await prisma.order.findMany({
      where: {
        buyerId: user.id,
        ...(rfqId && { rfqId }),
      },
      orderBy: { createdAt: "desc" },
    });

    // Parse JSON fields and return
    const orders = dbOrders.map(order => ({
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
    }));

    return jsonOk(orders, 200);
  });
}

