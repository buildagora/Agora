import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { getPrisma } from "@/lib/db.rsc";
import MaterialRequestDetailClient from "./MaterialRequestDetailClient";

/**
 * Material Request Detail Page - Server Component
 * 
 * Loads material request details directly from Prisma.
 */
export default async function MaterialRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const resolvedParams = await params;
  const requestId = resolvedParams.requestId;

  if (!requestId || requestId.trim() === "") {
    redirect("/buyer/requests");
  }

  // Auth check
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

  // Load user from database
  const prisma = getPrisma();
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  });

  if (!dbUser || dbUser.role !== "BUYER") {
    redirect("/buyer/login");
  }

  // Load material request and verify ownership
  const materialRequest = await prisma.materialRequest.findUnique({
    where: { id: requestId },
    include: {
      recipients: {
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          conversation: {
            select: {
              id: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { sentAt: "desc" },
      },
    },
  });

  if (!materialRequest) {
    redirect("/buyer/requests");
  }

  if (materialRequest.buyerId !== dbUser.id) {
    redirect("/buyer/requests");
  }

  // Group recipients by status
  const replied: typeof materialRequest.recipients = [];
  const pending: typeof materialRequest.recipients = [];
  const closedOut: typeof materialRequest.recipients = [];

  for (const recipient of materialRequest.recipients) {
    if (recipient.status === "REPLIED") {
      replied.push(recipient);
    } else if (recipient.status === "SENT" || recipient.status === "VIEWED") {
      pending.push(recipient);
    } else if (
      recipient.status === "DECLINED" ||
      recipient.status === "OUT_OF_STOCK" ||
      recipient.status === "NO_RESPONSE"
    ) {
      closedOut.push(recipient);
    }
  }

  // Format data for client
  const requestData = {
    id: materialRequest.id,
    categoryId: materialRequest.categoryId,
    requestText: materialRequest.requestText,
    sendMode: materialRequest.sendMode,
    status: materialRequest.status,
    createdAt: materialRequest.createdAt.toISOString(),
    updatedAt: materialRequest.updatedAt.toISOString(),
    closedAt: materialRequest.closedAt?.toISOString() || null,
    fulfilledAt: materialRequest.fulfilledAt?.toISOString() || null,
  };

  const formatRecipient = (r: typeof materialRequest.recipients[0]) => {
    const activityAt =
      r.respondedAt ??
      r.viewedAt ??
      r.statusUpdatedAt ??
      r.sentAt ??
      r.conversation.updatedAt;

    return {
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      conversationId: r.conversationId,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      viewedAt: r.viewedAt?.toISOString() || null,
      respondedAt: r.respondedAt?.toISOString() || null,
      conversationUpdatedAt: activityAt.toISOString(),
      operatorNotes: r.operatorNotes ?? null,
    };
  };

  const recipientsData = {
    replied: replied.map(formatRecipient),
    pending: pending.map(formatRecipient),
    closedOut: closedOut.map(formatRecipient),
  };

  return (
    <MaterialRequestDetailClient
      request={requestData}
      recipients={recipientsData}
    />
  );
}



