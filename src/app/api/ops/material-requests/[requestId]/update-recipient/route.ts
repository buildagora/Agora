/**
 * POST /api/ops/material-requests/[requestId]/update-recipient
 * Internal: manually update a material request recipient status (and optional notes).
 * No auth yet — use only in trusted / local environments.
 *
 * When notes are non-empty: creates an AGORA SupplierMessage, bumps the conversation,
 * and creates the in-app notification in the same DB transaction; buyer email is sent after commit (best effort).
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { getPrisma } from "@/lib/db.server";
import { categoryIdToLabel } from "@/lib/categoryIds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["REPLIED", "OUT_OF_STOCK", "NO_RESPONSE", "VIEWED", "SENT"]);

const AVAILABILITY = new Set([
  "CHECKING",
  "IN_STOCK",
  "OUT_OF_STOCK",
  "AVAILABLE_SOON",
]);

function statusFromAvailability(av: string): string {
  switch (av) {
    case "IN_STOCK":
    case "AVAILABLE_SOON":
      return "REPLIED";
    case "OUT_OF_STOCK":
      return "OUT_OF_STOCK";
    case "CHECKING":
      return "VIEWED";
    default:
      return "VIEWED";
  }
}

function parseOptionalBool(v: unknown): boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return undefined;
}

function parseOptionalInt(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }
  return undefined;
}

function parseOptionalDecimal(
  v: unknown
): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Prisma.Decimal(v);
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    try {
      return new Prisma.Decimal(t);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

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

    if (typeof supplierId !== "string" || !supplierId.trim()) {
      return jsonError("BAD_REQUEST", "supplierId is required", 400);
    }

    const availabilityRaw = b.availabilityStatus;
    const legacyStatus = b.status;

    let derivedStatus: string;
    let availabilityStatusValue: string | null | undefined;

    if (
      typeof availabilityRaw === "string" &&
      AVAILABILITY.has(availabilityRaw)
    ) {
      availabilityStatusValue = availabilityRaw;
      derivedStatus = statusFromAvailability(availabilityRaw);
    } else if (typeof legacyStatus === "string" && ALLOWED_STATUS.has(legacyStatus)) {
      derivedStatus = legacyStatus;
      availabilityStatusValue = undefined;
    } else {
      return jsonError(
        "BAD_REQUEST",
        "Provide availabilityStatus (CHECKING | IN_STOCK | OUT_OF_STOCK | AVAILABLE_SOON) or legacy status (REPLIED | OUT_OF_STOCK | NO_RESPONSE | VIEWED | SENT)",
        400
      );
    }

    const notesFromBody =
      typeof b.operatorNotes === "string"
        ? b.operatorNotes
        : typeof b.notes === "string"
          ? b.notes
          : undefined;

    let notesValue: string | null | undefined;
    if (notesFromBody !== undefined) {
      const trimmed = notesFromBody.trim();
      notesValue = trimmed.length > 0 ? trimmed : null;
    }

    const quantityAvailable = parseOptionalInt(b.quantityAvailable);
    const quantityUnit = parseOptionalString(b.quantityUnit);
    const price = parseOptionalDecimal(b.price);
    const priceUnit = parseOptionalString(b.priceUnit);
    const pickupAvailable = parseOptionalBool(b.pickupAvailable);
    const deliveryAvailable = parseOptionalBool(b.deliveryAvailable);
    const deliveryEta = parseOptionalString(b.deliveryEta);

    if (
      b.quantityAvailable !== undefined &&
      b.quantityAvailable !== null &&
      b.quantityAvailable !== "" &&
      quantityAvailable === undefined
    ) {
      return jsonError("BAD_REQUEST", "quantityAvailable must be an integer or empty", 400);
    }
    if (
      b.price !== undefined &&
      b.price !== null &&
      String(b.price).trim() !== "" &&
      price === undefined
    ) {
      return jsonError("BAD_REQUEST", "price must be a valid number", 400);
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

    const updateData: Prisma.MaterialRequestRecipientUpdateInput = {
      status: derivedStatus,
      statusUpdatedAt: now,
    };

    if (availabilityStatusValue !== undefined) {
      updateData.availabilityStatus = availabilityStatusValue;
    }

    if (quantityAvailable !== undefined) {
      updateData.quantityAvailable = quantityAvailable;
    }
    if (quantityUnit !== undefined) {
      updateData.quantityUnit = quantityUnit;
    }
    if (price !== undefined) {
      updateData.price = price;
    }
    if (priceUnit !== undefined) {
      updateData.priceUnit = priceUnit;
    }
    if (pickupAvailable !== undefined) {
      updateData.pickupAvailable = pickupAvailable;
    }
    if (deliveryAvailable !== undefined) {
      updateData.deliveryAvailable = deliveryAvailable;
    }
    if (deliveryEta !== undefined) {
      updateData.deliveryEta = deliveryEta;
    }
    if (notesValue !== undefined) {
      updateData.operatorNotes = notesValue;
    }

    if (derivedStatus === "VIEWED" || derivedStatus === "SENT") {
      updateData.viewedAt = now;
    }
    if (derivedStatus === "REPLIED") {
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
          availabilityStatus: true,
          quantityAvailable: true,
          quantityUnit: true,
          price: true,
          priceUnit: true,
          pickupAvailable: true,
          deliveryAvailable: true,
          deliveryEta: true,
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
          price: updated.price != null ? Number(updated.price) : null,
        },
      },
      200
    );
  });
}
