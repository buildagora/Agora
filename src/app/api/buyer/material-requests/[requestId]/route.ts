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
                messages: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    body: true,
                    createdAt: true,
                  },
                },
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

    // Format recipients for response
    const formatRecipient = (r: typeof materialRequest.recipients[0]) => {
      const lastMessage = r.conversation.messages[0];
      return {
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        conversationId: r.conversationId,
        status: r.status,
        sentAt: r.sentAt.toISOString(),
        viewedAt: r.viewedAt?.toISOString() || null,
        respondedAt: r.respondedAt?.toISOString() || null,
        conversationUpdatedAt: r.conversation.updatedAt.toISOString(),
        lastMessagePreview: lastMessage
          ? lastMessage.body.substring(0, 100) + (lastMessage.body.length > 100 ? "..." : "")
          : null,
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

