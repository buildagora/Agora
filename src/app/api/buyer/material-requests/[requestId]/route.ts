import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/material-requests/[requestId]
 * 
 * Returns detailed information about a specific material request including all recipients.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  return withErrorHandling(async () => {
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { requestId } = await context.params;
    const prisma = getPrisma();

    // Load material request and verify ownership (minimal select for older production schemas)
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
      return jsonError("NOT_FOUND", "Material request not found", 404);
    }

    if (materialRequest.buyerId !== user.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
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

    return NextResponse.json({
      ok: true,
      request: {
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
      },
      recipients: {
        replied: replied.map(formatRecipient),
        pending: pending.map(formatRecipient),
        closedOut: closedOut.map(formatRecipient),
      },
    });
  });
}

/**
 * DELETE /api/buyer/material-requests/[requestId]
 *
 * Deletes the material request (recipients cascade; conversations get materialRequestId cleared per schema).
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  return withErrorHandling(async () => {
    let user;
    try {
      user = await requireCurrentUserFromRequest(_request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { requestId } = await context.params;
    const prisma = getPrisma();

    const materialRequest = await prisma.materialRequest.findUnique({
      where: { id: requestId },
      select: { id: true, buyerId: true },
    });

    if (!materialRequest) {
      return jsonError("NOT_FOUND", "Material request not found", 404);
    }

    if (materialRequest.buyerId !== user.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    await prisma.materialRequest.delete({
      where: { id: materialRequest.id },
    });

    return NextResponse.json({ ok: true });
  });
}

