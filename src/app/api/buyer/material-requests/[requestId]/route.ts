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
      return jsonError("NOT_FOUND", "Material request not found", 404);
    }

    if (materialRequest.buyerId !== user.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
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
        locationCity: materialRequest.locationCity ?? null,
        locationRegion: materialRequest.locationRegion ?? null,
        locationCountry: materialRequest.locationCountry ?? null,
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

