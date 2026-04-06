import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { categoryIdToLabel } from "@/lib/categoryIds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/seller/messages/conversations/[conversationId]/messages
 * Send a message as SUPPLIER
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  return withErrorHandling(async () => {
    // Auth check
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    const { conversationId } = await context.params;

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { body: messageBody } = body;
    if (!messageBody || typeof messageBody !== "string" || !messageBody.trim()) {
      return jsonError("BAD_REQUEST", "Message body is required", 400);
    }

    const prisma = getPrisma();
    
    // Get seller's supplierId via SupplierMember
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true, fullName: true, companyName: true },
    });

    if (!dbUser || dbUser.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Find ACTIVE supplier membership
    const membership = await prisma.supplierMember.findFirst({
      where: {
        userId: dbUser.id,
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    if (!membership) {
      return jsonError("BAD_REQUEST", "Your supplier account is pending verification or not linked. Please contact support.", 400);
    }

    const supplier = { id: membership.supplierId };

    // Verify conversation belongs to this supplier and load request context for buyer notification
    const conversation = await prisma.supplierConversation.findUnique({
      where: { id: conversationId },
      select: {
        supplierId: true,
        buyerId: true,
        materialRequestId: true,
        rfqId: true,
        materialRequest: {
          select: { id: true, requestText: true, categoryId: true },
        },
        rfq: {
          select: { id: true, title: true, rfqNumber: true },
        },
      },
    });

    if (!conversation) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    if (conversation.supplierId !== supplier.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Create message
    await prisma.supplierMessage.create({
      data: {
        conversationId: conversationId,
        senderType: "SUPPLIER",
        senderDisplayName: dbUser.fullName || dbUser.companyName || null,
        body: messageBody.trim(),
      },
    });

    // Update conversation updatedAt and unhide for both sides (new activity)
    await prisma.supplierConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        hiddenForBuyerAt: null,
        hiddenForSupplierAt: null,
      },
    });

    // If this is a material-request conversation, update recipient status to REPLIED
    if (conversation.materialRequestId) {
      try {
        const now = new Date();
        await prisma.materialRequestRecipient.updateMany({
          where: {
            materialRequestId: conversation.materialRequestId,
            supplierId: supplier.id,
          },
          data: {
            status: "REPLIED",
            respondedAt: now,
            statusUpdatedAt: now,
          },
        });
        console.log("[MATERIAL_REQUEST_RECIPIENT_REPLIED]", {
          materialRequestId: conversation.materialRequestId,
          supplierId: supplier.id,
          conversationId: conversationId,
        });
      } catch (updateError) {
        // Log but don't fail - message was successfully created
        console.error("[MATERIAL_REQUEST_RECIPIENT_UPDATE_FAILED]", {
          materialRequestId: conversation.materialRequestId,
          supplierId: supplier.id,
          conversationId: conversationId,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }
    }

    // Send email notification and create in-app notification for buyer
    try {
      // Load buyer user
      const buyer = await prisma.user.findUnique({
        where: { id: conversation.buyerId },
        select: { id: true, email: true, fullName: true, companyName: true },
      });

      // Load supplier info
      const supplierInfo = await prisma.supplier.findUnique({
        where: { id: supplier.id },
        select: { id: true, name: true },
      });

      if (buyer && buyer.email && supplierInfo) {
        const messagePreview = messageBody.trim().substring(0, 160);
        const buyerName = buyer.fullName || buyer.companyName || "Buyer";
        const supplierName = supplierInfo.name;

        // Send email notification
        try {
          const { sendBuyerNewMessageEmail } = await import("@/lib/notifications/resend.server");
          await sendBuyerNewMessageEmail({
            to: buyer.email,
            buyerName: buyerName,
            supplierName: supplierName,
            conversationId: conversationId,
            supplierId: supplier.id,
            messagePreview: messagePreview,
          });
        } catch (emailError) {
          // Log but don't fail the request if email fails
          console.error("[BUYER_MESSAGE_EMAIL_FAILED]", {
            buyerId: buyer.id,
            buyerEmail: buyer.email,
            conversationId: conversationId,
            supplierId: supplier.id,
            error: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }

        // Create in-app notification with request context for buyer dashboard
        try {
          if (!buyer.id) {
            throw new Error("buyer.id is null or undefined");
          }

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
            supplierId: supplier.id,
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

          const notification = await prisma.notification.create({
            data: {
              userId: buyer.id,
              type: "MESSAGE_RECEIVED",
              data: JSON.stringify(notificationData),
            },
          });

          console.log("[BUYER_NOTIFICATION_CREATED]", {
            notificationId: notification.id,
            buyerId: buyer.id,
            conversationId: conversationId,
            supplierId: supplier.id,
            databaseUrl: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 20)}...` : "not set",
          });
        } catch (notificationError) {
          // Log but don't fail the request if notification creation fails
          console.error("[BUYER_NOTIFICATION_CREATE_FAILED]", {
            buyerId: buyer.id,
            buyerEmail: buyer.email,
            conversationId: conversationId,
            supplierId: supplier.id,
            error: notificationError instanceof Error ? notificationError.message : String(notificationError),
            stack: notificationError instanceof Error ? notificationError.stack : undefined,
            databaseUrl: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 20)}...` : "not set",
          });
        }
      }
    } catch (error) {
      // Log but don't fail the request if notification logic fails
      console.error("[BUYER_NOTIFICATION_ERROR]", {
        conversationId: conversationId,
        error: error,
      });
    }

    return NextResponse.json({ ok: true });
  });
}

