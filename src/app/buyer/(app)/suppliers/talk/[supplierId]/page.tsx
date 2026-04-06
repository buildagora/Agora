import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { getPrisma } from "@/lib/db.rsc";
import SupplierConversationClient from "./SupplierConversationClient";

/**
 * Supplier Conversation Page - Server Component
 * 
 * Loads supplier info, conversations list, and messages directly from Prisma.
 * No client-side API calls needed for initial load.
 * Supports ?conversationId=... query param to open specific conversation.
 */
export default async function SupplierConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ conversationId?: string; rfqId?: string }>;
}) {
  // Unwrap params and searchParams Promises (Next.js 15+)
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  // Defensive guard: redirect if params or supplierId is missing or empty
  if (!resolvedParams || !resolvedParams.supplierId || resolvedParams.supplierId.trim() === "") {
    redirect("/buyer/suppliers/talk");
  }

  const supplierId = resolvedParams.supplierId;
  const conversationIdFromQuery = resolvedSearchParams.conversationId;
  const rfqIdFromQuery = resolvedSearchParams.rfqId;

  // Auth check - read cookie and verify
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    redirect("/buyer/login");
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    redirect("/buyer/login");
  }

  // Load user from database to check role
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, fullName: true, companyName: true },
  });

  if (!dbUser || dbUser.role !== "BUYER") {
    redirect("/buyer/login");
  }

  const buyerId = dbUser.id;

  // Load supplier
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!supplier) {
    redirect("/buyer/suppliers/talk");
  }

  // First, determine the active conversation to decide sidebar scope
  // If conversationId is provided in query, use that (for deep-linking)
  let selectedConversation: { id: string; materialRequestId: string | null } | null = null;
  
  if (conversationIdFromQuery) {
    // Verify the conversation belongs to this buyer
    const fullConv = await prisma.supplierConversation.findUnique({
      where: { id: conversationIdFromQuery },
      select: { id: true, buyerId: true, supplierId: true, materialRequestId: true },
    });
    
    if (fullConv && fullConv.buyerId === buyerId) {
      // Conversation belongs to this buyer - use it
      // If supplierId in URL doesn't match, redirect to the correct supplier URL
      if (fullConv.supplierId !== supplierId) {
        redirect(`/buyer/suppliers/talk/${fullConv.supplierId}?conversationId=${encodeURIComponent(conversationIdFromQuery)}`);
      }
      selectedConversation = { id: fullConv.id, materialRequestId: fullConv.materialRequestId };
      if (selectedConversation.materialRequestId) {
        redirect(`/buyer/material-requests/${selectedConversation.materialRequestId}`);
      }
    }
  }

  // Load conversations for sidebar based on selected conversation's materialRequestId
  // If the selected conversation has a materialRequestId, scope sidebar to that request
  // Otherwise, load all conversations (global inbox behavior)
  const sidebarWhere = selectedConversation?.materialRequestId
    ? {
        buyerId: buyerId,
        materialRequestId: selectedConversation.materialRequestId,
      }
    : {
        buyerId: buyerId,
      };

  const allConversations = await prisma.supplierConversation.findMany({
    where: sidebarWhere,
    include: {
      supplier: {
        select: { id: true, name: true },
      },
      rfq: {
        select: { id: true, rfqNumber: true, title: true },
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
    WHERE "userId" = ${buyerId}
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

  // Format conversations for sidebar with RFQ context
  let conversations = allConversations.map((conv) => {
    const lastMessage = conv.messages[0];
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

  // Find or create conversation for this supplier
  // If we already found it above (from conversationId query), use that
  let conversation: { id: string } | null = selectedConversation ? { id: selectedConversation.id } : null;
  
  if (!conversation) {
    // If rfqId is provided in query, prioritize RFQ-scoped conversation
    if (rfqIdFromQuery) {
      // Verify RFQ exists and belongs to this buyer
      const rfq = await prisma.rFQ.findUnique({
        where: { id: rfqIdFromQuery },
        select: { id: true, buyerId: true },
      });

      if (rfq && rfq.buyerId === buyerId) {
        // Find or create RFQ-scoped conversation (must have materialRequestId: null to avoid material-request threads)
        const rfqConv = await prisma.supplierConversation.findFirst({
          where: {
            buyerId: buyerId,
            supplierId: supplierId,
            rfqId: rfqIdFromQuery,
            materialRequestId: null, // RFQ conversations must not be material-request threads
          },
        });

        if (rfqConv) {
          conversation = { id: rfqConv.id };
        } else {
          // Create new RFQ-scoped conversation
          const newConv = await prisma.supplierConversation.create({
            data: {
              buyerId: buyerId,
              supplierId: supplierId,
              rfqId: rfqIdFromQuery,
              materialRequestId: null, // RFQ conversations must not be material-request threads
            },
          });
          conversation = { id: newConv.id };
        }
      }
    }

    // If no RFQ-scoped conversation found/created, fall back to general conversation
    if (!conversation) {
      // Find or create general conversation for this supplier (no RFQ scope, no material request scope)
      // Use findFirst because findUnique doesn't support null in compound unique constraints
      const generalConv = await prisma.supplierConversation.findFirst({
        where: {
          buyerId: buyerId,
          supplierId: supplierId,
          rfqId: null, // General conversation, not tied to a specific RFQ
          materialRequestId: null, // General conversation, not tied to a specific material request
        },
      });

      if (generalConv) {
        conversation = { id: generalConv.id };
      } else {
        // Create new general conversation (no RFQ scope, no material request scope)
        const newConv = await prisma.supplierConversation.create({
          data: {
            buyerId: buyerId,
            supplierId: supplierId,
            rfqId: null, // General conversation, not tied to a specific RFQ
            materialRequestId: null, // General conversation, not tied to a specific material request
          },
        });
        conversation = { id: newConv.id };
      }
    }
  }

  // Load the full conversation to get RFQ and material request context
  const fullConversation = await prisma.supplierConversation.findUnique({
    where: { id: conversation.id },
    select: {
      id: true,
      supplierId: true,
      buyerId: true,
      rfqId: true,
      materialRequestId: true,
      updatedAt: true,
      rfq: {
        select: { id: true, rfqNumber: true, title: true },
      },
    },
  });

  if (fullConversation?.materialRequestId) {
    redirect(`/buyer/material-requests/${fullConversation.materialRequestId}`);
  }

  // If we didn't have selectedConversation from query param, check if we need to reload sidebar
  // This handles the edge case where we found/created a material-request conversation without a conversationId in query
  // (though this should be rare - material-request conversations should typically come with conversationId)
  const finalMaterialRequestId = fullConversation?.materialRequestId;
  const initiallyLoadedAllConversations = !selectedConversation;
  const needsSidebarReload = initiallyLoadedAllConversations && finalMaterialRequestId !== null;
  
  if (needsSidebarReload) {
    // Reload sidebar to scope to this material request
    const reloadedConversations = await prisma.supplierConversation.findMany({
      where: {
        buyerId: buyerId,
        materialRequestId: finalMaterialRequestId,
      },
      include: {
        supplier: {
          select: { id: true, name: true },
        },
        rfq: {
          select: { id: true, rfqNumber: true, title: true },
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

    // Rebuild conversations list with unread counts
    const reloadedUnreadCountsResult = await prisma.$queryRaw<Array<{ conversationId: string; unreadCount: bigint }>>`
      SELECT (data::jsonb->>'conversationId') AS "conversationId", COUNT(*)::int AS "unreadCount"
      FROM "Notification"
      WHERE "userId" = ${buyerId}
        AND type = 'MESSAGE_RECEIVED'
        AND "readAt" IS NULL
      GROUP BY (data::jsonb->>'conversationId')
    `;

    const reloadedUnreadCountMap = new Map<string, number>();
    for (const row of reloadedUnreadCountsResult) {
      if (row.conversationId) {
        reloadedUnreadCountMap.set(row.conversationId, Number(row.unreadCount));
      }
    }

    conversations = reloadedConversations.map((conv) => {
      const lastMessage = conv.messages[0];
      const unreadCount = reloadedUnreadCountMap.get(conv.id) || 0;
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
  }

  // Load messages for this conversation
  const messages = await prisma.supplierMessage.findMany({
    where: {
      conversationId: conversation.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Format messages
  const formattedMessages = messages.map((msg) => ({
    id: msg.id,
    senderType: msg.senderType as "BUYER" | "SUPPLIER" | "AGORA",
    senderDisplayName: msg.senderDisplayName,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
  }));

  return (
    <SupplierConversationClient
      supplier={supplier}
      conversations={conversations}
      messages={formattedMessages}
      conversationId={conversation.id}
      supplierId={supplierId}
      buyerName={dbUser.fullName || dbUser.companyName || undefined}
      rfqId={fullConversation?.rfqId || null}
      rfqNumber={fullConversation?.rfq?.rfqNumber || null}
      rfqTitle={fullConversation?.rfq?.title || null}
      materialRequestId={fullConversation?.materialRequestId || null}
    />
  );
}
