/**
 * POST /api/ops/material-requests/[requestId]/update-recipient
 * Internal: manually update a material request recipient status (and optional notes).
 * No auth yet — use only in trusted / local environments.
 *
 * When notes are non-empty: creates an AGORA SupplierMessage, bumps the conversation,
 * and creates the in-app notification in the same DB transaction; buyer email is sent after commit (best effort).
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { getPrisma } from "@/lib/db.server";
import { categoryIdToLabel } from "@/lib/categoryIds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["REPLIED", "OUT_OF_STOCK", "NO_RESPONSE", "VIEWED"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  return withErrorHandling(async () => {
    requireServerEnv();

    const { requestId } = await context.params;
    if (!requestId?.trim()) {
      return jsonError("BAD_REQUEST", "requestId is required", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError("BAD_REQUEST", "Invalid request body", 400);
    }

    const b = body as Record<string, unknown>;
    const supplierId = b.supplierId;
    const status = b.status;
    const notes = b.notes;

    if (typeof supplierId !== "string" || !supplierId.trim()) {
      return jsonError("BAD_REQUEST", "supplierId is required", 400);
    }

    if (typeof status !== "string" || !ALLOWED_STATUS.has(status)) {
      return jsonError(
        "BAD_REQUEST",
        "status must be one of: REPLIED, OUT_OF_STOCK, NO_RESPONSE, VIEWED",
        400
      );
    }

    let notesValue: string | null | undefined;
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== "string") {
        return jsonError("BAD_REQUEST", "notes must be a string", 400);
      }
      const trimmed = notes.trim();
      notesValue = trimmed.length > 0 ? trimmed : null;
    }

    const prisma = getPrisma();
    const now = new Date();

    const existing = await prisma.materialRequestRecipient.findUnique({
      where: {
        materialRequestId_supplierId: {
          materialRequestId: requestId.trim(),
          supplierId: supplierId.trim(),
        },
      },
      include: {
        conversation: {
          select: {
            id: true,
            buyerId: true,
            supplierId: true,
            materialRequestId: true,
            rfqId: true,
            materialRequest: {
              select: { id: true, requestText: true, categoryId: true },
            },
            rfq: {
              select: { id: true, title: true, rfqNumber: true },
            },
          },
        },
        supplier: {
          select: { id: true, name: true },
        },
        materialRequest: {
          select: {
            id: true,
            buyerId: true,
            requestText: true,
            categoryId: true,
            buyer: {
              select: { id: true, email: true, fullName: true, companyName: true },
            },
          },
        },
      },
    });

    if (!existing) {
      return jsonError("NOT_FOUND", "Recipient not found for this request and supplier", 404);
    }

    if (!existing.conversationId || !existing.conversation) {
      return jsonError(
        "BAD_REQUEST",
        "Recipient has no linked supplier conversation; cannot update or notify buyer",
        400
      );
    }

    const shouldCreateMessage =
      notesValue !== undefined && notesValue !== null && notesValue.length > 0;

    const updateData: {
      status: string;
      statusUpdatedAt: Date;
      operatorNotes?: string | null;
      viewedAt?: Date;
      respondedAt?: Date;
    } = {
      status,
      statusUpdatedAt: now,
    };

    if (notesValue !== undefined) {
      updateData.operatorNotes = notesValue;
    }

    if (status === "VIEWED") {
      updateData.viewedAt = now;
    }
    if (status === "REPLIED") {
      updateData.respondedAt = now;
    }

    const conversationId = existing.conversationId;
    const messageBodyText = shouldCreateMessage ? notesValue! : "";

    /** In-app row: same eligibility as seller route (buyer email + supplier present). */
    let notificationInsert: { userId: string; dataJson: string } | null = null;
    if (shouldCreateMessage) {
      const conversation = existing.conversation;
      const supplierInfo = existing.supplier;
      const buyer = existing.materialRequest.buyer;

      if (buyer?.id && buyer.email && supplierInfo) {
        const messagePreview = messageBodyText.substring(0, 160);
        const supplierName = supplierInfo.name;
        const mr = conversation.materialRequest;
        const rfq = conversation.rfq;
        const categoryId = mr?.categoryId ?? undefined;
        const categoryLabel =
          categoryId && categoryId in categoryIdToLabel
            ? (categoryIdToLabel as Record<string, string>)[categoryId]
            : undefined;

        let contextLabel: string;
        if (mr?.requestText?.trim()) {
          const text = mr.requestText.trim();
          contextLabel = text.length > 60 ? `Request: ${text.substring(0, 60)}…` : `Request: ${text}`;
        } else if (rfq?.title?.trim()) {
          contextLabel = `RFQ: ${rfq.title.trim()}`;
        } else if (categoryLabel) {
          contextLabel = `${categoryLabel} request`;
        } else {
          contextLabel = "Recent supplier response";
        }

        let urlPath: string;
        if (conversation.materialRequestId) {
          urlPath = `/buyer/material-requests/${conversation.materialRequestId}`;
        } else if (conversation.rfqId) {
          urlPath = `/buyer/rfqs/${conversation.rfqId}?conversationId=${encodeURIComponent(conversationId)}`;
        } else {
          urlPath = "/buyer/requests";
        }

        const notificationData: Record<string, unknown> = {
          conversationId: conversationId,
          supplierId: supplierInfo.id,
          supplierName: supplierName,
          messagePreview: messagePreview,
          urlPath,
          contextLabel,
        };
        if (conversation.materialRequestId) {
          notificationData.materialRequestId = conversation.materialRequestId;
          if (mr?.requestText != null) notificationData.materialRequestText = mr.requestText;
          if (mr?.categoryId != null) notificationData.categoryId = mr.categoryId;
        }
        if (conversation.rfqId && rfq) {
          notificationData.rfqId = conversation.rfqId;
          if (rfq.title != null) notificationData.rfqTitle = rfq.title;
        }

        notificationInsert = {
          userId: buyer.id,
          dataJson: JSON.stringify(notificationData),
        };
      }
    }

    let createdNotificationId: string | undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const recipient = await tx.materialRequestRecipient.update({
        where: {
          materialRequestId_supplierId: {
            materialRequestId: requestId.trim(),
            supplierId: supplierId.trim(),
          },
        },
        data: updateData,
        select: {
          id: true,
          materialRequestId: true,
          supplierId: true,
          status: true,
          statusUpdatedAt: true,
          viewedAt: true,
          respondedAt: true,
          operatorNotes: true,
        },
      });

      if (shouldCreateMessage) {
        await tx.supplierMessage.create({
          data: {
            conversationId,
            senderType: "AGORA",
            senderDisplayName: "Agora",
            body: messageBodyText,
          },
        });

        await tx.supplierConversation.update({
          where: { id: conversationId },
          data: {
            updatedAt: new Date(),
            hiddenForBuyerAt: null,
            hiddenForSupplierAt: null,
          },
        });

        if (notificationInsert) {
          const notification = await tx.notification.create({
            data: {
              userId: notificationInsert.userId,
              type: "MESSAGE_RECEIVED",
              data: notificationInsert.dataJson,
            },
          });
          createdNotificationId = notification.id;
        }
      }

      return recipient;
    });

    if (createdNotificationId) {
      console.log("[BUYER_NOTIFICATION_CREATED]", {
        notificationId: createdNotificationId,
        buyerId: existing.materialRequest.buyer?.id,
        conversationId: conversationId,
        supplierId: existing.supplier.id,
        source: "ops_update_recipient",
      });
    }

    let buyerNotified = false;

    if (shouldCreateMessage) {
      const buyer = existing.materialRequest.buyer;
      const supplierInfo = existing.supplier;

      try {
        if (buyer && buyer.email && supplierInfo) {
          const messagePreview = messageBodyText.substring(0, 160);
          const buyerName = buyer.fullName || buyer.companyName || "Buyer";
          const supplierName = supplierInfo.name;

          try {
            const { sendBuyerNewMessageEmail } = await import("@/lib/notifications/resend.server");
            await sendBuyerNewMessageEmail({
              to: buyer.email,
              buyerName: buyerName,
              supplierName: supplierName,
              conversationId: conversationId,
              supplierId: supplierInfo.id,
              messagePreview: messagePreview,
            });
            buyerNotified = true;
          } catch (emailError) {
            console.error("[BUYER_MESSAGE_EMAIL_FAILED]", {
              buyerId: buyer.id,
              buyerEmail: buyer.email,
              conversationId: conversationId,
              supplierId: supplierInfo.id,
              error: emailError instanceof Error ? emailError.message : String(emailError),
            });
          }
        }
      } catch (error) {
        console.error("[BUYER_NOTIFICATION_ERROR]", {
          conversationId: conversationId,
          error: error,
        });
      }
    }

    return jsonOk(
      {
        updated: true,
        messageCreated: shouldCreateMessage,
        buyerNotified,
        recipient: {
          ...updated,
          statusUpdatedAt: updated.statusUpdatedAt.toISOString(),
          viewedAt: updated.viewedAt?.toISOString() ?? null,
          respondedAt: updated.respondedAt?.toISOString() ?? null,
        },
      },
      200
    );
  });
}
