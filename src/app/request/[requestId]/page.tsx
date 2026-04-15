import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/db.rsc";
import AutoRefresh from "@/components/AutoRefresh";
import MaterialRequestDetailClient from "@/app/buyer/(app)/material-requests/[requestId]/MaterialRequestDetailClient";

export const revalidate = 0;

/**
 * Public material request results — no auth. Used after landing search redirect.
 */
export default async function PublicRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const resolvedParams = await params;
  const requestId = resolvedParams.requestId;

  if (!requestId || requestId.trim() === "") {
    notFound();
  }

  const prisma = getPrisma();

  const materialRequest = await prisma.materialRequest.findUnique({
    where: { id: requestId.trim() },
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
    notFound();
  }

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

  const formatRecipient = (r: (typeof materialRequest.recipients)[0]) => {
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
    <>
      <AutoRefresh interval={5000} />
      <MaterialRequestDetailClient
        request={requestData}
        recipients={recipientsData}
        backHref="/"
      />
    </>
  );
}
