/**
 * Reusable helper for sending buyer messages to suppliers
 * Handles conversation creation/update, message creation, and notifications
 */

import { PrismaClient } from "@prisma/client";
import { sendSupplierMessageEmail, sendSupplierOnboardingEmail } from "@/lib/notifications/resend.server";

interface SendBuyerMessageParams {
  prisma: PrismaClient;
  buyer: {
    id: string;
    fullName: string | null;
    companyName: string | null;
  };
  supplierId: string;
  conversationId?: string; // If provided, use existing conversation; otherwise find or create
  messageBody: string;
}

/**
 * Sends a buyer message to a supplier, creating/updating conversation and sending notifications
 * Returns the conversation ID
 */
export async function sendBuyerMessageToSupplier(
  params: SendBuyerMessageParams
): Promise<{ conversationId: string }> {
  const { prisma, buyer, supplierId, conversationId: providedConversationId, messageBody } = params;

  // Find or create general conversation (no RFQ scope)
  let conversation;
  if (providedConversationId) {
    conversation = await prisma.supplierConversation.findUnique({
      where: { id: providedConversationId },
    });
    if (!conversation) {
      throw new Error(`Conversation not found: ${providedConversationId}`);
    }
  } else {
    // Use findFirst because findUnique doesn't support null in compound unique constraints
    // General conversation: rfqId=null AND materialRequestId=null
    conversation = await prisma.supplierConversation.findFirst({
      where: {
        buyerId: buyer.id,
        supplierId: supplierId,
        rfqId: null, // General conversation, not tied to a specific RFQ
        materialRequestId: null, // General conversation, not tied to a specific material request
      },
    });

    if (!conversation) {
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: buyer.id,
          supplierId: supplierId,
          rfqId: null, // General conversation, not tied to a specific RFQ
          materialRequestId: null, // General conversation, not tied to a specific material request
        },
      });
    }
  }

  // Create message
  await prisma.supplierMessage.create({
    data: {
      conversationId: conversation.id,
      senderType: "BUYER",
      senderDisplayName: buyer.fullName || buyer.companyName || null,
      body: messageBody.trim(),
    },
  });

  // Update conversation updatedAt and unhide for both sides (new activity)
  await prisma.supplierConversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: new Date(),
      hiddenForBuyerAt: null,
      hiddenForSupplierAt: null,
    },
  });

  // Send email notification and create in-app notification for ALL ACTIVE supplier members
  try {
    // Load supplier info (including email for fallback)
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, email: true },
    });

    if (!supplier) {
      console.warn("[SUPPLIER_NOT_FOUND]", {
        supplierId,
        conversationId: conversation.id,
      });
      return { conversationId: conversation.id };
    }

    const buyerName = buyer.fullName || buyer.companyName || "Buyer";
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

    // FALLBACK: If no active members, send onboarding email to supplier org email
    if (activeMembers.length === 0) {
      console.warn("[SUPPLIER_NO_ACTIVE_MEMBERS_FALLBACK]", {
        supplierId,
        conversationId: conversation.id,
        supplierEmail: supplier.email || null,
      });

      if (!supplier.email) {
        console.warn("[SUPPLIER_NO_EMAIL_FOR_FALLBACK_INVITE]", {
          supplierId,
          conversationId: conversation.id,
          supplierName: supplier.name,
        });
        return { conversationId: conversation.id };
      }

      // Send onboarding email to supplier org email
      try {
        await sendSupplierOnboardingEmail({
          to: supplier.email,
          supplierName: supplier.name,
          buyerName: buyerName,
          messagePreview: messagePreview,
          conversationId: conversation.id,
          supplierId: supplierId,
        });
        console.log("[SUPPLIER_FALLBACK_INVITE_EMAIL_SENT]", {
          supplierId,
          supplierEmail: supplier.email,
          conversationId: conversation.id,
        });
      } catch (emailError) {
        // Log but don't fail the request if email fails
        console.error("[SUPPLIER_FALLBACK_INVITE_EMAIL_FAILED]", {
          supplierId,
          supplierEmail: supplier.email,
          conversationId: conversation.id,
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }

      return { conversationId: conversation.id };
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
          // Log but don't fail the request if email fails
          console.error("[SUPPLIER_MEMBER_EMAIL_FAILED]", {
            supplierId,
            memberUserId: member.user.id,
            memberEmail: member.user.email,
            conversationId: conversation.id,
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
            data: JSON.stringify({
              conversationId: conversation.id,
              supplierId: supplierId,
              buyerId: buyer.id,
              buyerName: buyerName,
              messagePreview: messagePreview,
              urlPath: `/seller/messages?conversationId=${encodeURIComponent(conversation.id)}`,
            }),
          },
        });
        console.log("[SELLER_MEMBER_NOTIFICATION_CREATED]", {
          memberUserId: member.user.id,
          conversationId: conversation.id,
          supplierId: supplierId,
        });
      } catch (createError) {
        console.error("[SELLER_MEMBER_NOTIFICATION_CREATE_FAILED]", {
          memberUserId: member.user.id,
          supplierId,
          conversationId: conversation.id,
          error: createError instanceof Error ? createError.message : String(createError),
        });
      }
    }
  } catch (error) {
    // Log error but don't fail the request - message was successfully created
    console.error("[SUPPLIER_NOTIFICATION_ERROR]", {
      supplierId,
      conversationId: conversation.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return { conversationId: conversation.id };
}


