/**
 * GET /api/buyer/suppliers/conversations/by-id/[conversationId]
 * Get a specific buyer conversation by conversationId
 * 
 * This is the canonical way to reload a specific thread, whether it's
 * a general conversation (rfqId = null) or RFQ-scoped (rfqId != null).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  return withErrorHandling(async () => {
    // Auth check
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { conversationId } = await context.params;

    const prisma = getPrisma();

    // Load user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!dbUser || dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Load conversation and verify it belongs to this buyer
    const conversation = await prisma.supplierConversation.findUnique({
      where: { id: conversationId },
      include: {
        supplier: {
          select: { id: true, name: true },
        },
        rfq: {
          select: { id: true, rfqNumber: true, title: true },
        },
        messages: {
          where: {
            deletedForBuyerAt: null,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    if (conversation.buyerId !== dbUser.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Format messages
    const formattedMessages = conversation.messages.map((msg) => ({
      id: msg.id,
      senderType: msg.senderType as "BUYER" | "SUPPLIER" | "AGORA",
      senderDisplayName: msg.senderDisplayName,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      supplierId: conversation.supplierId,
      supplierName: conversation.supplier.name,
      rfqId: conversation.rfqId,
      rfqNumber: conversation.rfq?.rfqNumber || null,
      rfqTitle: conversation.rfq?.title || null,
      messages: formattedMessages,
    });
  });
}

