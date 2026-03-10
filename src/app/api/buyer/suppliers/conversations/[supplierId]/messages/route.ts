import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { sendSupplierMessageEmail, sendSupplierOnboardingEmail } from "@/lib/notifications/resend.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEV VERIFICATION CHECKLIST:
 * 
 * ✅ Buyer sends message -> seller gets email + Notification row created for SELLER user(s)
 * ✅ Seller sends message -> buyer gets email + Notification row created
 * ✅ Conversations list shows unreadCount badge until the thread is opened, then mark-thread-read clears it
 * ✅ GROUP CHAT: When buyer sends message, notifications created for ALL active SupplierMembers
 * 
 * To verify:
 * 1. Send buyer->supplier message, check Notification table for seller user
 * 2. Send supplier->buyer message, check Notification table for buyer user
 * 3. Check conversations list shows unread badges
 * 4. Open thread, verify badge clears (mark-thread-read called)
 * 5. GROUP CHAT TEST:
 *    - Create supplier org with multiple team members (admin + 2 members)
 *    - Buyer sends message to supplier conversation
 *    - Verify Notification rows created for ALL 3 active SupplierMembers
 *    - All members should see unread badge in UI
 */

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ supplierId: string }> }
) {
  return withErrorHandling(async () => {
    // Read auth cookie
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Verify JWT token
    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Load user from database
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, fullName: true, companyName: true },
    });

    if (!dbUser) {
      return jsonError("UNAUTHORIZED", "User not found", 401);
    }

    if (dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { supplierId } = await context.params;

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

    // Find or create general conversation (no RFQ scope)
    // Use findFirst because findUnique doesn't support null in compound unique constraints
    let conversation = await prisma.supplierConversation.findFirst({
      where: {
        buyerId: dbUser.id,
        supplierId: supplierId,
        rfqId: null, // General conversation, not tied to a specific RFQ
      },
    });

    if (!conversation) {
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: dbUser.id,
          supplierId: supplierId,
          rfqId: null, // General conversation, not tied to a specific RFQ
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
          return NextResponse.json({ ok: true });
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
          const notification = await prisma.notification.create({
            data: {
              userId: member.user.id,
              type: "MESSAGE_RECEIVED",
              data: JSON.stringify({
                conversationId: conversation.id,
                supplierId: supplierId,
                buyerId: dbUser.id,
                buyerName: buyerName,
                messagePreview: messagePreview,
                urlPath: `/seller/messages?conversationId=${encodeURIComponent(conversation.id)}`,
              }),
            },
          });
          console.log("[SELLER_MEMBER_NOTIFICATION_CREATED]", {
            notificationId: notification.id,
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

    return NextResponse.json({ ok: true });
  });
}

