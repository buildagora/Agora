/**
 * GET /api/ops/material-requests/[requestId]
 *
 * Same JSON as GET /api/buyer/material-requests/[requestId] (request + recipients
 * groups). No auth — local / trusted ops only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  return withErrorHandling(async () => {
    const { requestId } = await context.params;
    if (!requestId?.trim()) {
      return jsonError("BAD_REQUEST", "requestId is required", 400);
    }

    const prisma = getPrisma();
    const materialRequest = await prisma.materialRequest.findUnique({
      where: { id: requestId.trim() },
      include: {
        recipients: {
          include: {
            supplier: {
              select: { id: true, name: true },
            },
            conversation: {
              select: { id: true, updatedAt: true },
            },
          },
          orderBy: { sentAt: "desc" },
        },
      },
    });

    if (!materialRequest) {
      return jsonError("NOT_FOUND", "Material request not found", 404);
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
      },
      recipients: {
        replied: replied.map(formatRecipient),
        pending: pending.map(formatRecipient),
        closedOut: closedOut.map(formatRecipient),
      },
    });
  });
}
