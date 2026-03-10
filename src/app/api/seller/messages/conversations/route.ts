import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/messages/conversations
 * List all conversations for the logged-in seller
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    // Auth check
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    const prisma = getPrisma();
    
    // Get seller's supplierId via SupplierMember
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true },
    });

    if (!dbUser || dbUser.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Find ACTIVE supplier membership
    const membership = await prisma.supplierMember.findFirst({
      where: {
        userId: dbUser.id,
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    if (!membership) {
      // Seller has no active supplier membership - return empty list
      return NextResponse.json({
        ok: true,
        conversations: [],
      });
    }

    const supplierId = membership.supplierId;

    // Get all conversations for this supplier, including RFQ info
    const conversations = await prisma.supplierConversation.findMany({
      where: {
        supplierId: supplierId,
      },
      include: {
        buyer: {
          select: { id: true, fullName: true, companyName: true, email: true },
        },
        rfq: {
          select: { id: true, rfqNumber: true, title: true, status: true },
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

    // Format conversations for response with RFQ context
    const formattedConversations = conversations.map((conv) => {
      const lastMessage = conv.messages[0];
      const buyerName = conv.buyer.companyName || conv.buyer.fullName || conv.buyer.email || "Buyer";
      const unreadCount = unreadCountMap.get(conv.id) || 0;
      
      return {
        id: conv.id,
        buyerId: conv.buyerId,
        buyerName: buyerName,
        buyerEmail: conv.buyer.email,
        rfqId: conv.rfqId,
        rfqNumber: conv.rfq?.rfqNumber || null,
        rfqTitle: conv.rfq?.title || null,
        rfqStatus: conv.rfq?.status || null,
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

