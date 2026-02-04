/**
 * Buyer Messages by RFQ API
 * Returns messages for a specific RFQ thread
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

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { rfqId } = await params;

    // Verify RFQ ownership
    const prisma = getPrisma();
    const dbRfq = await prisma.rFQ.findFirst({
      where: { 
        id: rfqId,
        buyerId: user.id, // Ownership check
      },
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Query messages from database
    const dbMessages = await prisma.message.findMany({
      where: {
        rfqId: rfqId,
        buyerId: user.id,
      },
      orderBy: { createdAt: "asc" },
    });

    // Parse JSON fields and return
    const messages = dbMessages.map(msg => ({
      id: msg.id,
      rfqId: msg.rfqId,
      threadId: msg.threadId,
      buyerId: msg.buyerId,
      sellerId: msg.sellerId,
      fromRole: msg.fromRole,
      fromName: msg.fromName,
      senderId: msg.senderId,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
      metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
      seenByBuyerAt: msg.seenByBuyerAt?.toISOString() || null,
      seenBySellerAt: msg.seenBySellerAt?.toISOString() || null,
    }));

    return jsonOk(messages, 200);
  });
}

export async function POST(
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

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { rfqId } = await params;
    const body = await request.json().catch(() => ({}));
    const { message, sellerId } = body;

    // Verify RFQ ownership
    const prisma = getPrisma();
    const dbRfq = await prisma.rFQ.findFirst({
      where: { 
        id: rfqId,
        buyerId: user.id,
      },
    });

    if (!dbRfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    if (!message || typeof message !== "string") {
      return jsonError("BAD_REQUEST", "message (string) required", 400);
    }

    if (!sellerId || typeof sellerId !== "string") {
      return jsonError("BAD_REQUEST", "sellerId (string) required", 400);
    }

    // Generate threadId
    const threadId = `thread:rq=${rfqId}|b=${user.id}|s=${sellerId}`;

    // Save message to database
    const dbMessage = await prisma.message.create({
      data: {
        rfqId: rfqId,
        threadId: threadId,
        buyerId: user.id,
        sellerId: sellerId,
        fromRole: "BUYER",
        fromName: user.companyName || user.fullName || "Buyer",
        senderId: user.id,
        body: message,
      },
    });

    return jsonOk({
      id: dbMessage.id,
      rfqId: dbMessage.rfqId,
      threadId: dbMessage.threadId,
      createdAt: dbMessage.createdAt.toISOString(),
    }, 200);
  });
}

