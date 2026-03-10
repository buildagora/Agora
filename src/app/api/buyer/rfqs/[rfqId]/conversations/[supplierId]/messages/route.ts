/**
 * GET /api/buyer/rfqs/[rfqId]/conversations/[supplierId]/messages
 * Get messages for an RFQ-scoped conversation with a specific supplier
 * 
 * POST /api/buyer/rfqs/[rfqId]/conversations/[supplierId]/messages
 * Send a message in an RFQ-scoped conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { sendSupplierMessageEmail } from "@/lib/notifications/resend.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rfqId: string; supplierId: string }> }
) {
  return withErrorHandling(async () => {
    // Auth check
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { rfqId, supplierId } = await context.params;

    const prisma = getPrisma();

    // Load user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!dbUser || dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Verify RFQ belongs to this buyer
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, buyerId: true },
    });

    if (!rfq || rfq.buyerId !== dbUser.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Find RFQ-scoped conversation
    const conversation = await prisma.supplierConversation.findUnique({
      where: {
        buyerId_supplierId_rfqId: {
          buyerId: dbUser.id,
          supplierId: supplierId,
          rfqId: rfqId,
        },
      },
    });

    if (!conversation) {
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
  context: { params: Promise<{ rfqId: string; supplierId: string }> }
) {
  return withErrorHandling(async () => {
    // Auth check
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { rfqId, supplierId } = await context.params;

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

    // Load user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, fullName: true, companyName: true },
    });

    if (!dbUser || dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Verify RFQ belongs to this buyer
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, buyerId: true },
    });

    if (!rfq || rfq.buyerId !== dbUser.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Find or create RFQ-scoped conversation
    let conversation = await prisma.supplierConversation.findUnique({
      where: {
        buyerId_supplierId_rfqId: {
          buyerId: dbUser.id,
          supplierId: supplierId,
          rfqId: rfqId,
        },
      },
    });

    if (!conversation) {
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: dbUser.id,
          supplierId: supplierId,
          rfqId: rfqId,
        },
      });
    }

    // Create message
    await prisma.supplierMessage.create({
      data: {
        conversationId: conversation.id,
        senderType: "BUYER",
        senderDisplayName: dbUser.fullName || dbUser.companyName || null,
        body: messageBody.trim(),
      },
    });

    // Update conversation updatedAt
    await prisma.supplierConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Send email notification and create in-app notification for ALL ACTIVE supplier members
    try {
      // Load supplier info
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true },
      });

      if (!supplier) {
        console.warn("[SUPPLIER_NOT_FOUND]", { supplierId, conversationId: conversation.id });
        return NextResponse.json({ ok: true });
      }

      const buyerName = dbUser.fullName || dbUser.companyName || "Buyer";
      const messagePreview = messageBody.trim().substring(0, 160);

      // Find ALL ACTIVE supplier members for this supplier
      const activeMembers = await prisma.supplierMember.findMany({
        where: {
          supplierId: supplierId,
          status: "ACTIVE",
        },
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      });

      if (activeMembers.length === 0) {
        console.warn("[NO_ACTIVE_SUPPLIER_MEMBERS]", { supplierId, conversationId: conversation.id });
        return NextResponse.json({ ok: true });
      }

      // Notify each active member (group chat behavior)
      for (const member of activeMembers) {
        // Send email notification
        if (member.user.email) {
          try {
            await sendSupplierMessageEmail({
              to: member.user.email,
              supplierName: supplier.name,
              buyerName: buyerName,
              conversationId: conversation.id,
              supplierId: supplierId,
              messagePreview: messagePreview,
            });
          } catch (emailError) {
            console.error("[SUPPLIER_MEMBER_EMAIL_FAILED]", {
              supplierId,
              memberUserId: member.user.id,
              memberEmail: member.user.email,
              conversationId: conversation.id,
              rfqId: rfqId,
              error: emailError instanceof Error ? emailError.message : String(emailError),
            });
          }
        }

        // Create in-app notification
        try {
          await prisma.notification.create({
            data: {
              userId: member.user.id,
              type: "MESSAGE_RECEIVED",
              rfqId: rfqId,
              data: JSON.stringify({
                conversationId: conversation.id,
                supplierId: supplierId,
                buyerId: dbUser.id,
                buyerName: buyerName,
                rfqId: rfqId,
                messagePreview: messagePreview,
                urlPath: `/seller/rfqs/${rfqId}?conversationId=${encodeURIComponent(conversation.id)}`,
              }),
            },
          });
        } catch (createError) {
          console.error("[SELLER_MEMBER_NOTIFICATION_CREATE_FAILED]", {
            memberUserId: member.user.id,
            supplierId,
            conversationId: conversation.id,
            rfqId: rfqId,
            error: createError instanceof Error ? createError.message : String(createError),
          });
        }
      }
    } catch (error) {
      console.error("[SUPPLIER_NOTIFICATION_ERROR]", {
        supplierId,
        conversationId: conversation.id,
        rfqId: rfqId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ ok: true, conversationId: conversation.id });
  });
}

