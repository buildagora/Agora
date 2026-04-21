import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/db.rsc";
import AutoRefresh from "@/components/AutoRefresh";
import MaterialRequestDetailClient from "@/app/buyer/(app)/material-requests/[requestId]/MaterialRequestDetailClient";

export const revalidate = 0;

/** Same formula as `/api/buyer/material-requests` — distance in statute miles. */
function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthMi = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthMi * c;
}

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
      locationCity: true,
      locationRegion: true,
      locationCountry: true,
      latitude: true,
      longitude: true,
      recipients: {
        select: {
          supplierId: true,
          conversationId: true,
          status: true,
          sentAt: true,
          viewedAt: true,
          respondedAt: true,
          statusUpdatedAt: true,
          operatorNotes: true,
          availabilityStatus: true,
          quantityAvailable: true,
          quantityUnit: true,
          price: true,
          priceUnit: true,
          pickupAvailable: true,
          deliveryAvailable: true,
          deliveryEta: true,
          supplier: {
            select: {
              id: true,
              name: true,
              street: true,
              city: true,
              state: true,
              zip: true,
              latitude: true,
              longitude: true,
              phone: true,
              logoUrl: true,
              hoursText: true,
            },
          },
          conversation: {
            select: {
              id: true,
              updatedAt: true,
            },
          },
        },
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
    locationCity: materialRequest.locationCity ?? null,
    locationRegion: materialRequest.locationRegion ?? null,
    locationCountry: materialRequest.locationCountry ?? null,
    latitude: materialRequest.latitude ?? null,
    longitude: materialRequest.longitude ?? null,
  };

  const formatRecipient = (r: (typeof rows)[number]) => {
    const activityAt =
      r.respondedAt ??
      r.viewedAt ??
      r.statusUpdatedAt ??
      r.sentAt ??
      r.conversation?.updatedAt ??
      materialRequest.updatedAt;

    const reqLat = materialRequest.latitude;
    const reqLon = materialRequest.longitude;
    const supLat = r.supplier.latitude;
    const supLon = r.supplier.longitude;

    let distanceMiles: number | null = null;
    if (
      reqLat != null &&
      reqLon != null &&
      supLat != null &&
      supLon != null &&
      Number.isFinite(reqLat) &&
      Number.isFinite(reqLon) &&
      Number.isFinite(supLat) &&
      Number.isFinite(supLon)
    ) {
      const d = haversineMiles(reqLat, reqLon, supLat, supLon);
      distanceMiles = Math.round(d * 10) / 10;
    }

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
      address: `${r.supplier.street}, ${r.supplier.city}, ${r.supplier.state} ${r.supplier.zip}`,
      phone: r.supplier.phone,
      logoUrl: r.supplier.logoUrl ?? null,
      hoursText: r.supplier.hoursText ?? null,
      availabilityStatus: r.availabilityStatus ?? null,
      quantityAvailable: r.quantityAvailable ?? null,
      quantityUnit: r.quantityUnit ?? null,
      price: r.price != null ? Number(r.price) : null,
      priceUnit: r.priceUnit ?? null,
      pickupAvailable: r.pickupAvailable ?? null,
      deliveryAvailable: r.deliveryAvailable ?? null,
      deliveryEta: r.deliveryEta ?? null,
      distanceMiles,
    };
  };

  function sortRecipientsByDistance<
    T extends { distanceMiles: number | null; supplierName: string },
  >(items: T[]): T[] {
    return [...items].sort((a, b) => {
      const aHas = a.distanceMiles != null;
      const bHas = b.distanceMiles != null;
      if (aHas && bHas) return a.distanceMiles! - b.distanceMiles!;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }

  const recipientsData = {
    replied: sortRecipientsByDistance(replied.map(formatRecipient)),
    pending: sortRecipientsByDistance(pending.map(formatRecipient)),
    closedOut: sortRecipientsByDistance(closedOut.map(formatRecipient)),
  };

  return (
    <>
      <AutoRefresh interval={5000} />
      <MaterialRequestDetailClient
        request={requestData}
        recipients={recipientsData}
      />
    </>
  );
}
