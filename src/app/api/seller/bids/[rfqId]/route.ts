/**
 * Seller Bids by RFQ API
 * GET: Returns seller's bid for a specific RFQ
 * POST: Creates/updates a bid for a specific RFQ
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BidSubmitSchema = z.object({
  lineItems: z.array(z.object({
    description: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.union([z.string(), z.number()]).transform((v) => String(v)),
    unitPrice: z.union([z.string(), z.number()]).transform((v) => String(v)),
  })).min(1),
  notes: z.string().optional().default(""),
  leadTimeDays: z.union([z.string(), z.number()]).optional().transform((v) => v ? parseInt(String(v)) : null),
  deliveryCharge: z.union([z.string(), z.number()]).optional().transform((v) => v ? parseFloat(String(v)) : 0),
});

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

    const { rfqId } = await params;

    // Verify RFQ exists and is open
    const prisma = getPrisma();
    const dbRfq = await prisma.rFQ.findFirst({
      where: { 
        id: rfqId,
        status: "OPEN",
      },
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Query bid from database
    const dbBid = await prisma.bid.findFirst({
      where: {
        rfqId: rfqId,
        sellerId: user.id,
      },
    });

    if (!dbBid) {
      return jsonOk(null, 200);
    }

    // Parse JSON fields and return
    const bid = {
      id: dbBid.id,
      rfqId: dbBid.rfqId,
      sellerId: dbBid.sellerId,
      createdAt: dbBid.createdAt.toISOString(),
      status: dbBid.status,
      lineItems: dbBid.lineItems ? JSON.parse(dbBid.lineItems) : [],
      notes: dbBid.notes,
      deliveryCharge: dbBid.deliveryCharge,
      total: dbBid.total,
      leadTimeDays: dbBid.leadTimeDays,
      seenByBuyerAt: dbBid.seenByBuyerAt?.toISOString() || null,
      seenBySellerAt: dbBid.seenBySellerAt?.toISOString() || null,
    };

    return jsonOk(bid, 200);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  return withErrorHandling(async () => {
    // CRITICAL: Log API hit (always, not just dev)
    console.log("[SELLER_BID_API_HIT]", {
      rfqId: (await params).rfqId,
      sellerId: "pending",
    });

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

    const { rfqId } = await params;

    // Update log with actual sellerId
    console.log("[SELLER_BID_API_HIT]", {
      rfqId,
      sellerId: user.id,
    });

    // Parse and validate body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const validation = BidSubmitSchema.safeParse(body);
    if (!validation.success) {
      return jsonError("BAD_REQUEST", "Invalid bid data", 400, validation.error.issues);
    }

    const validatedData = validation.data;

    // Verify RFQ exists and is open
    const prisma = getPrisma();
    const dbRfq = await prisma.rFQ.findFirst({
      where: { 
        id: rfqId,
        status: "OPEN",
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
      return jsonError("NOT_FOUND", "RFQ not found or not open", 404);
    }

    // Check if bid already exists (upsert logic: update if exists)
    const existingBid = await prisma.bid.findFirst({
      where: {
        rfqId: rfqId,
        sellerId: user.id,
      },
    });

    // Calculate totals server-side
    const parsedLineItems = validatedData.lineItems.map((item) => ({
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    const lineItemsSubtotal = parsedLineItems.reduce((sum: number, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);

    const deliveryCharge = validatedData.deliveryCharge || 0;
    const total = lineItemsSubtotal + deliveryCharge;

    // Upsert bid (create or update)
    const dbBid = existingBid
      ? await prisma.bid.update({
          where: { id: existingBid.id },
          data: {
            status: "SUBMITTED",
            lineItems: JSON.stringify(parsedLineItems),
            notes: validatedData.notes || "",
            deliveryCharge: deliveryCharge,
            total: total,
            leadTimeDays: validatedData.leadTimeDays,
          },
        })
      : await prisma.bid.create({
          data: {
            rfqId: rfqId,
            sellerId: user.id,
            status: "SUBMITTED",
            lineItems: JSON.stringify(parsedLineItems),
            notes: validatedData.notes || "",
            deliveryCharge: deliveryCharge,
            total: total,
            leadTimeDays: validatedData.leadTimeDays,
          },
        });

    // CRITICAL: Log DB creation success immediately after create
    console.log("[SELLER_BID_DB_OK]", {
      bidId: dbBid.id,
      rfqId: dbBid.rfqId,
      sellerId: dbBid.sellerId,
      total: dbBid.total,
    });

    // Trigger buyer notification (in-process, awaited)
    console.log("[SELLER_BID_NOTIFY_START]", {
      rfqId: dbBid.rfqId,
      bidId: dbBid.id,
      buyerId: dbRfq.buyerId,
    });

    try {
      const { notifyBuyerOfNewBid } = await import("@/lib/bids/notifyBuyerOfNewBid.server");
      const stats = await notifyBuyerOfNewBid({
        bidId: dbBid.id,
        rfqId: dbBid.rfqId,
        rfqNumber: dbRfq.rfqNumber,
        rfqTitle: dbRfq.title,
        buyerId: dbRfq.buyerId,
        buyerEmail: dbRfq.buyer.email,
        buyerName: dbRfq.buyer.fullName || dbRfq.buyer.companyName || undefined,
        sellerId: user.id,
        sellerName: user.fullName || user.companyName || "Seller",
        bidTotal: dbBid.total || 0,
      });

      // CRITICAL: Always log final notification stats
      console.log("[SELLER_BID_NOTIFY_DONE]", {
        rfqId: dbBid.rfqId,
        bidId: dbBid.id,
        attempted: stats.attempted,
        sent: stats.sent,
        errors: stats.errors,
      });
    } catch (error) {
      // Never fail bid creation due to notification errors
      console.error("[SELLER_BID_NOTIFY_FAILED]", {
        rfqId: dbBid.rfqId,
        bidId: dbBid.id,
        error: String(error),
      });
    }

    // Return created/updated bid
    return jsonOk({
      ok: true,
      bid: {
        id: dbBid.id,
        rfqId: dbBid.rfqId,
        sellerId: dbBid.sellerId,
        createdAt: dbBid.createdAt.toISOString(),
        status: dbBid.status,
        lineItems: parsedLineItems,
        notes: dbBid.notes,
        deliveryCharge: dbBid.deliveryCharge,
        total: dbBid.total,
        leadTimeDays: dbBid.leadTimeDays,
      },
    }, existingBid ? 200 : 201);
  });
}
