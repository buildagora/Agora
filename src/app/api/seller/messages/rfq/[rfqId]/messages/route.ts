/**
 * GET /api/seller/messages/rfq/[rfqId]/messages
 * Get messages for an RFQ-scoped conversation
 * 
 * POST /api/seller/messages/rfq/[rfqId]/messages
 * Send a message in an RFQ-scoped conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { sendBuyerNewMessageEmail } from "@/lib/notifications/resend.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rfqId: string }> }
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

    const { rfqId } = await context.params;

    const prisma = getPrisma();

    // Verify RFQ exists
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, buyerId: true },
    });

    if (!rfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Get seller's supplierId via SupplierMember
    const membership = await prisma.supplierMember.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    if (!membership) {
      return jsonError("BAD_REQUEST", "Your supplier account is pending verification or not linked. Please contact support.", 400);
    }

    const supplierId = membership.supplierId;

    // Find RFQ-scoped conversation (must have materialRequestId: null to avoid material-request threads)
    const conversation = await prisma.supplierConversation.findFirst({
      where: {
        buyerId: rfq.buyerId,
        supplierId: supplierId,
        rfqId: rfqId,
        materialRequestId: null, // RFQ conversations must not be material-request threads
      },
    });

    if (!conversation) {
      // No conversation yet - return empty messages
      return NextResponse.json({
        ok: true,
        conversationId: null,
        messages: [],
      });
    }

    // Load messages
    const messages = await prisma.supplierMessage.findMany({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Format messages
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderType: msg.senderType as "BUYER" | "SUPPLIER" | "AGORA",
      senderDisplayName: msg.senderDisplayName,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messages: formattedMessages,
    });
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ rfqId: string }> }
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

    const { rfqId } = await context.params;

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

    // Verify RFQ exists and get buyer info
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, buyerId: true, rfqNumber: true, title: true },
    });

    if (!rfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

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

    const supplierId = membership.supplierId;

    // Find or create RFQ-scoped conversation (must have materialRequestId: null to avoid material-request threads)
    let conversation = await prisma.supplierConversation.findFirst({
      where: {
        buyerId: rfq.buyerId,
        supplierId: supplierId,
        rfqId: rfqId,
        materialRequestId: null, // RFQ conversations must not be material-request threads
      },
    });

    if (!conversation) {
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: rfq.buyerId,
          supplierId: supplierId,
          rfqId: rfqId,
          materialRequestId: null, // RFQ conversations must not be material-request threads
        },
      });
    }

    // Create message
    await prisma.supplierMessage.create({
      data: {
        conversationId: conversation.id,
        senderType: "SUPPLIER",
        senderDisplayName: dbUser.fullName || dbUser.companyName || null,
        body: messageBody.trim(),
      },
    });

    // Update conversation updatedAt
    await prisma.supplierConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Send email notification and create in-app notification for buyer
    try {
      // Load buyer user
      const buyer = await prisma.user.findUnique({
        where: { id: rfq.buyerId },
        select: { id: true, email: true, fullName: true, companyName: true },
      });

      // Load supplier info
      const supplierInfo = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true },
      });

      if (buyer && buyer.email && supplierInfo) {
        const messagePreview = messageBody.trim().substring(0, 160);
        const buyerName = buyer.fullName || buyer.companyName || "Buyer";
        const supplierName = supplierInfo.name;

        // Send email notification
        try {
          await sendBuyerNewMessageEmail({
            to: buyer.email,
            buyerName: buyerName,
            supplierName: supplierName,
            conversationId: conversation.id,
            supplierId: supplierId,
            messagePreview: messagePreview,
          });
        } catch (emailError) {
          console.error("[BUYER_MESSAGE_EMAIL_FAILED]", {
            buyerId: buyer.id,
            buyerEmail: buyer.email,
            conversationId: conversation.id,
            supplierId: supplierId,
            rfqId: rfqId,
            error: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }

        // Create in-app notification
        try {
          await prisma.notification.create({
            data: {
              userId: buyer.id,
              type: "MESSAGE_RECEIVED",
              rfqId: rfqId,
              data: JSON.stringify({
                conversationId: conversation.id,
                supplierId: supplierId,
                supplierName: supplierName,
                rfqId: rfqId,
                rfqNumber: rfq.rfqNumber,
                rfqTitle: rfq.title,
                messagePreview: messagePreview,
                urlPath: `/buyer/rfqs/${rfqId}?conversationId=${encodeURIComponent(conversation.id)}`,
              }),
            },
          });
        } catch (notificationError) {
          console.error("[BUYER_NOTIFICATION_CREATE_FAILED]", {
            buyerId: buyer.id,
            conversationId: conversation.id,
            rfqId: rfqId,
            error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          });
        }
      }
    } catch (error) {
      console.error("[BUYER_NOTIFICATION_ERROR]", {
        conversationId: conversation.id,
        rfqId: rfqId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ ok: true, conversationId: conversation.id });
  });
}
