import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { categoryIdToLabel } from "@/lib/categoryIds";

function deriveContextLabel(conv: {
  materialRequest?: { requestText?: string; categoryId?: string } | null;
  rfq?: { title?: string } | null;
}): string {
  const mr = conv.materialRequest;
  const rfq = conv.rfq;
  if (mr?.requestText?.trim()) {
    const text = mr.requestText.trim();
    return text.length > 60 ? `Request: ${text.substring(0, 60)}…` : `Request: ${text}`;
  }
  if (rfq?.title?.trim()) return `RFQ: ${rfq.title.trim()}`;
  if (mr?.categoryId) {
    const label =
      categoryIdToLabel[mr.categoryId as keyof typeof categoryIdToLabel] || mr.categoryId;
    return `${label} request`;
  }
  return "General conversation";
}

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

    // Get all conversations for this supplier, including RFQ and material-request context
    const conversations = await prisma.supplierConversation.findMany({
      where: {
        supplierId: supplierId,
        hiddenForSupplierAt: null,
      },
      include: {
        buyer: {
          select: { id: true, fullName: true, companyName: true, email: true },
        },
        rfq: {
          select: { id: true, rfqNumber: true, title: true, status: true },
        },
        materialRequest: {
          select: { id: true, requestText: true, categoryId: true },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Get latest visible message for each conversation (not deleted for seller)
    const conversationIds = conversations.map((c) => c.id);
    const allVisibleMessages = await prisma.supplierMessage.findMany({
      where: {
        conversationId: { in: conversationIds },
        deletedForSupplierAt: null,
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

    // Format conversations for response with RFQ and material-request context
    const formattedConversations = conversations.map((conv) => {
      const lastMessage = latestMessageMap.get(conv.id);
      const buyerName = conv.buyer.companyName || conv.buyer.fullName || conv.buyer.email || "Buyer";
      const unreadCount = unreadCountMap.get(conv.id) || 0;
      const contextLabel = deriveContextLabel(conv);

      return {
        id: conv.id,
        buyerId: conv.buyerId,
        buyerName: buyerName,
        buyerEmail: conv.buyer.email,
        rfqId: conv.rfqId,
        rfqNumber: conv.rfq?.rfqNumber || null,
        rfqTitle: conv.rfq?.title || null,
        rfqStatus: conv.rfq?.status || null,
        materialRequestId: conv.materialRequestId ?? null,
        materialRequestText: conv.materialRequest?.requestText ?? null,
        categoryId: conv.materialRequest?.categoryId ?? null,
        contextLabel,
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

