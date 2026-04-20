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

  // Load material request and verify ownership (minimal select for older DB schemas)
  const materialRequest = await prisma.materialRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      buyerId: true,
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
    redirect("/buyer/requests");
  }

  if (materialRequest.buyerId !== dbUser.id) {
    redirect("/buyer/requests");
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
    <MaterialRequestDetailClient
      request={requestData}
      recipients={recipientsData}
    />
  );
}
