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
    select: {
      id: true,
      categoryId: true,
      requestText: true,
      sendMode: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      fulfilledAt: true,
      recipients: {
        select: {
          supplierId: true,
          conversationId: true,
          status: true,
          sentAt: true,
          viewedAt: true,
          respondedAt: true,
          supplier: {
            select: {
              id: true,
              name: true,
              street: true,
              city: true,
              state: true,
              zip: true,
              phone: true,
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

  const rows = materialRequest.recipients ?? [];
  const replied: typeof rows = [];
  const pending: typeof rows = [];
  const closedOut: typeof rows = [];

  for (const recipient of rows) {
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
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
  };

  const formatRecipient = (r: (typeof rows)[number]) => {
    const activityAt =
      r.conversation?.updatedAt ??
      r.respondedAt ??
      r.viewedAt ??
      r.sentAt ??
      materialRequest.updatedAt;

    return {
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      conversationId: r.conversationId,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      viewedAt: r.viewedAt?.toISOString() || null,
      respondedAt: r.respondedAt?.toISOString() || null,
      conversationUpdatedAt: activityAt.toISOString(),
      operatorNotes: null,
      address: `${r.supplier.street}, ${r.supplier.city}, ${r.supplier.state} ${r.supplier.zip}`,
      phone: r.supplier.phone,
      logoUrl: null,
      hoursText: null,
      availabilityStatus: null,
      quantityAvailable: null,
      quantityUnit: null,
      price: null,
      priceUnit: null,
      pickupAvailable: null,
      deliveryAvailable: null,
      deliveryEta: null,
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
