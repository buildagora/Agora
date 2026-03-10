import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { getPrisma } from "@/lib/db.rsc";
import SellerMessagesClient from "./SellerMessagesClient";
import AppShell from "@/components/ui2/AppShell";

/**
 * Seller Messages Page - Server Component
 * 
 * Loads conversations and messages directly from Prisma.
 * Supports query string: ?conversationId=...
 */
export default async function SellerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; from?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const conversationIdFromUrl = resolvedSearchParams.conversationId;

  // Auth check - read cookie and verify
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;

  const targetUrl = "/seller/messages" + (conversationIdFromUrl ? `?conversationId=${conversationIdFromUrl}` : "");
  
  if (!token) {
    redirect("/seller/login?returnTo=" + encodeURIComponent(targetUrl));
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    redirect("/seller/login?returnTo=" + encodeURIComponent(targetUrl));
  }

  // Load user from database to check role
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, email: true, fullName: true, companyName: true },
  });

  if (!dbUser || dbUser.role !== "SELLER") {
    redirect("/seller/login?returnTo=" + encodeURIComponent(targetUrl));
  }

  // Find supplier via ACTIVE SupplierMember
  const membership = await prisma.supplierMember.findFirst({
    where: {
      userId: dbUser.id,
      status: "ACTIVE",
    },
    include: {
      supplier: {
        select: { id: true, name: true },
      },
    },
  });

  if (!membership || !membership.supplier) {
    // Seller has no active supplier membership - show empty state
    return (
      <AppShell role="seller" active="messages">
        <div className="flex flex-1 flex-col px-6 py-8 max-w-6xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Messages
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Active conversations with buyers
            </p>
          </div>
          <div className="text-center py-12">
            <p className="text-zinc-600 dark:text-zinc-400">
              Your supplier account is pending verification or not linked. Please contact support.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const supplier = membership.supplier;
  const supplierId = supplier.id;

  // Load all conversations for this supplier, including RFQ info
  const allConversations = await prisma.supplierConversation.findMany({
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

  // Format conversations for sidebar with RFQ context
  const conversations = allConversations.map((conv) => {
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

  // Load messages for selected conversation if provided
  let initialMessages: any[] = [];
  if (conversationIdFromUrl) {
    // Verify conversation belongs to this supplier
    const conversation = await prisma.supplierConversation.findUnique({
      where: { id: conversationIdFromUrl },
      select: { supplierId: true },
    });

    if (conversation && conversation.supplierId === supplierId) {
      const messages = await prisma.supplierMessage.findMany({
        where: {
          conversationId: conversationIdFromUrl,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      initialMessages = messages.map((msg) => ({
        id: msg.id,
        senderType: msg.senderType as "BUYER" | "SUPPLIER" | "AGORA",
        senderDisplayName: msg.senderDisplayName,
        body: msg.body,
        createdAt: msg.createdAt.toISOString(),
      }));
    }
  }

  return (
    <AppShell role="seller" active="messages">
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Messages
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Active conversations with buyers
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <SellerMessagesClient
            initialConversations={conversations}
            initialMessages={initialMessages}
            initialConversationId={conversationIdFromUrl || undefined}
            supplierName={supplier.name}
          />
        </div>
      </div>
    </AppShell>
  );
}
