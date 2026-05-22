import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, jsonOk, withErrorHandling } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  notes?: string | null;
  requestedDeliveryDate?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  fulfillmentMethod?: string | null;
  deliveryNotes?: string | null;
};

function parseQuantity(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseRequestedDeliveryDate(value: unknown): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { id: purchaseOrderId } = await params;
    if (!purchaseOrderId?.trim()) {
      return jsonError("BAD_REQUEST", "purchaseOrderId is required", 400);
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    // Accepted for future persistence; not stored yet.
    void body.fulfillmentMethod;
    void body.deliveryNotes;

    const prisma = getPrisma();
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId.trim() },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!existing) {
      return jsonError("NOT_FOUND", "Purchase order not found", 404);
    }

    const firstItem = existing.items[0];
    if (!firstItem) {
      return jsonError("NOT_FOUND", "Purchase order has no items", 404);
    }

    const notes =
      body.notes === undefined
        ? undefined
        : body.notes === null
          ? null
          : String(body.notes).trim() || null;

    const requestedDeliveryDate =
      body.requestedDeliveryDate === undefined
        ? undefined
        : parseRequestedDeliveryDate(body.requestedDeliveryDate);

    const quantity =
      body.quantity === undefined ? undefined : parseQuantity(body.quantity);

    const unit =
      body.unit === undefined
        ? undefined
        : body.unit === null
          ? null
          : String(body.unit).trim() || null;

    await prisma.$transaction([
      prisma.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          ...(notes !== undefined && { notes }),
          ...(requestedDeliveryDate !== undefined && { requestedDeliveryDate }),
        },
      }),
      prisma.purchaseOrderItem.update({
        where: { id: firstItem.id },
        data: {
          ...(quantity !== undefined && { quantity }),
          ...(unit !== undefined && { unit }),
        },
      }),
    ]);

    return jsonOk({});
  });
}
