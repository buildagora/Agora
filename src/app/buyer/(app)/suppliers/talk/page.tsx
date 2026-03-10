import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { getPrisma } from "@/lib/db.rsc";
import TalkToSuppliersClient from "./TalkToSuppliersClient";

/**
 * Talk to Suppliers Page - Server Component
 * 
 * Functions as an inbox: shows conversations list by default.
 * Supports discovery UI via "New message" button.
 * Handles deep-linking: ?supplierId=XYZ redirects to thread page.
 */
export default async function TalkToSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; supplierId?: string }>;
}) {
  // Auth check - read cookie and verify
  const cookieStore = await cookies();
  const cookieName = getAuthCookieName();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    const resolvedSearchParams = await searchParams;
    const supplierId = resolvedSearchParams.supplierId;
    const redirectUrl = supplierId
      ? `/buyer/suppliers/talk?supplierId=${supplierId}`
      : "/buyer/suppliers/talk";
    redirect(`/buyer/login?returnTo=${encodeURIComponent(redirectUrl)}`);
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    const resolvedSearchParams = await searchParams;
    const supplierId = resolvedSearchParams.supplierId;
    const redirectUrl = supplierId
      ? `/buyer/suppliers/talk?supplierId=${supplierId}`
      : "/buyer/suppliers/talk";
    redirect(`/buyer/login?returnTo=${encodeURIComponent(redirectUrl)}`);
  }

  // Load user from database to check role
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  });

  if (!dbUser || dbUser.role !== "BUYER") {
    const resolvedSearchParams = await searchParams;
    const supplierId = resolvedSearchParams.supplierId;
    const redirectUrl = supplierId
      ? `/buyer/suppliers/talk?supplierId=${supplierId}`
      : "/buyer/suppliers/talk";
    redirect(`/buyer/login?returnTo=${encodeURIComponent(redirectUrl)}`);
  }

  // Unwrap searchParams Promise (Next.js 15+)
  const resolvedSearchParams = await searchParams;
  
  // Handle deep-link: if supplierId is present, redirect to thread page
  if (resolvedSearchParams.supplierId) {
    redirect(`/buyer/suppliers/talk/${resolvedSearchParams.supplierId}`);
  }

  // Get category from searchParams
  const rawCategoryId = resolvedSearchParams.categoryId || "";
  const normalizedCategoryId = rawCategoryId.toLowerCase();

  // Load conversations for inbox
  const allConversations = await prisma.supplierConversation.findMany({
    where: {
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

  // Format conversations for sidebar
  const conversations = allConversations.map((conv) => {
    const lastMessage = conv.messages[0];
    const unreadCount = unreadCountMap.get(conv.id) || 0;
    return {
      id: conv.id,
      supplierId: conv.supplierId,
      supplierName: conv.supplier.name,
      lastMessagePreview: lastMessage
        ? lastMessage.body.substring(0, 50) + (lastMessage.body.length > 50 ? "..." : "")
        : "No messages yet",
      lastMessageAt: lastMessage
        ? lastMessage.createdAt.toISOString()
        : conv.updatedAt.toISOString(),
      unreadCount,
    };
  });

  return (
    <TalkToSuppliersClient
      initialCategoryId={normalizedCategoryId}
      initialConversations={conversations}
    />
  );
}
