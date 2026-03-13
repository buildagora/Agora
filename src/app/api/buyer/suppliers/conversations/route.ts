import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    // Read auth cookie
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Verify JWT token
    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Load user from database
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, fullName: true, companyName: true },
    });

    if (!dbUser) {
      return jsonError("UNAUTHORIZED", "User not found", 401);
    }

    if (dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Get all conversations for this buyer, ordered by most recent message
    // Include RFQ context when available
    const conversations = await prisma.supplierConversation.findMany({
      where: {
        buyerId: dbUser.id,
      },
      include: {
        supplier: true,
        rfq: {
          select: { id: true, rfqNumber: true, title: true },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Get latest visible message for each conversation (not deleted for buyer)
    const conversationIds = conversations.map((c) => c.id);
    const allVisibleMessages = await prisma.supplierMessage.findMany({
      where: {
        conversationId: { in: conversationIds },
        deletedForBuyerAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Build map of conversationId -> latest visible message (first one we see per conversation)
    const latestMessageMap = new Map<string, typeof allVisibleMessages[0]>();
    for (const msg of allVisibleMessages) {
      if (!latestMessageMap.has(msg.conversationId)) {
        latestMessageMap.set(msg.conversationId, msg);
      }
    }

    // Get unread counts for all conversations
    const unreadCountsResult = await prisma.$queryRaw<Array<{ conversationId: string; unreadCount: bigint }>>`
      SELECT (data::jsonb->>'conversationId') AS "conversationId", COUNT(*)::int AS "unreadCount"
      FROM "Notification"
      WHERE "userId" = ${dbUser.id}
        AND type = 'MESSAGE_RECEIVED'
        AND "readAt" IS NULL
      GROUP BY (data::jsonb->>'conversationId')
    `;

    // Build map of conversationId -> unreadCount
    const unreadCountMap = new Map<string, number>();
    for (const row of unreadCountsResult) {
      if (row.conversationId) {
        unreadCountMap.set(row.conversationId, Number(row.unreadCount));
      }
    }

    const formattedConversations = conversations.map((conv) => {
      const lastMessage = latestMessageMap.get(conv.id);
      const unreadCount = unreadCountMap.get(conv.id) || 0;
      return {
        id: conv.id,
        supplierId: conv.supplierId,
        supplierName: conv.supplier.name,
        rfqId: conv.rfqId,
        rfqNumber: conv.rfq?.rfqNumber || null,
        rfqTitle: conv.rfq?.title || null,
        lastMessagePreview: lastMessage
          ? lastMessage.body.substring(0, 50) + (lastMessage.body.length > 50 ? "..." : "")
          : "No messages yet",
        lastMessageAt: lastMessage
          ? lastMessage.createdAt.toISOString()
          : conv.updatedAt.toISOString(),
        unreadCount,
      };
    });

    return NextResponse.json({
      ok: true,
      conversations: formattedConversations,
    });
  });
}

