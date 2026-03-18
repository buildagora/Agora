/**
 * GET /api/buyer/rfqs/[rfqId]/conversations
 * Get all RFQ-scoped conversations for a buyer's RFQ
 * 
 * Returns conversations grouped by supplier, one conversation per supplier for this RFQ.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rfqId: string }> }
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

    const { rfqId } = await context.params;

    const prisma = getPrisma();

    // Load user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!dbUser || dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Verify RFQ belongs to this buyer
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, buyerId: true },
    });

    if (!rfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    if (rfq.buyerId !== dbUser.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Get all RFQ-scoped conversations for this RFQ
    const conversations = await prisma.supplierConversation.findMany({
      where: {
        rfqId: rfqId,
        buyerId: dbUser.id,
      },
      include: {
        supplier: {
          select: { id: true, name: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Format conversations
    const formattedConversations = conversations.map((conv) => {
      const lastMessage = conv.messages[0];
      return {
        id: conv.id,
        supplierId: conv.supplierId,
        supplierName: conv.supplier.name,
        lastMessagePreview: lastMessage
          ? lastMessage.body.substring(0, 50) + (lastMessage.body.length > 50 ? "..." : "")
          : null,
        lastMessageAt: lastMessage
          ? lastMessage.createdAt.toISOString()
          : conv.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      ok: true,
      conversations: formattedConversations,
    });
  });
}




