import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { sendSupplierMessageEmail, sendSupplierOnboardingEmail } from "@/lib/notifications/resend.server";
import { trackServerEvent } from "@/lib/analytics/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/material-requests
 * 
 * Returns the authenticated buyer's material requests with recipient counts.
 */
export async function GET(request: NextRequest) {
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

    const prisma = getPrisma();

    // Load buyer's material requests
    const requests = await prisma.materialRequest.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        recipients: {
          select: {
            status: true,
          },
        },
      },
    });

    // Calculate counts for each request
    const requestsWithCounts = requests.map((req) => {
      const recipients = req.recipients;
      const totalRecipients = recipients.length;
      const repliedCount = recipients.filter((r) => r.status === "REPLIED").length;
      const pendingCount = recipients.filter((r) => r.status === "SENT" || r.status === "VIEWED").length;
      const declinedCount = recipients.filter(
        (r) => r.status === "DECLINED" || r.status === "OUT_OF_STOCK" || r.status === "NO_RESPONSE"
      ).length;

      return {
        id: req.id,
        categoryId: req.categoryId,
        requestText: req.requestText,
        sendMode: req.sendMode,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        updatedAt: req.updatedAt.toISOString(),
        counts: {
          totalRecipients,
          repliedCount,
          pendingCount,
          declinedCount,
        },
      };
    });

    return NextResponse.json({
      ok: true,
      data: requestsWithCounts,
    });
  });
}

/**
 * POST /api/buyer/material-requests
 * 
 * Creates a new material request and broadcasts it to relevant suppliers.
 * For each supplier, creates a conversation and sends the request as a message.
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const fail = async (
      errorCode: string,
      status: number,
      message: string,
      props?: Record<string, string | number | boolean | null>
    ) => {
      await trackServerEvent(ANALYTICS_EVENTS.request_submission_failed, {
        error_code: errorCode.toLowerCase(),
        ...props,
      });
      return jsonError(errorCode, message, status);
    };

    // Read auth cookie
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return fail("UNAUTHORIZED", 401, "Authentication required");
    }

    // Verify JWT token
    const payload = await verifyAuthToken(token);
    if (!payload) {
      return fail("UNAUTHORIZED", 401, "Authentication required");
    }

    // Load user from database
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, fullName: true, companyName: true },
    });

    if (!dbUser) {
      return fail("UNAUTHORIZED", 401, "User not found");
    }

    if (dbUser.role !== "BUYER") {
      return fail("FORBIDDEN", 403, "Buyer access required");
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return fail("BAD_REQUEST", 400, "Invalid JSON");
    }

    const { categoryId, requestText, sendMode, supplierIds } = body;

    // Validate required fields
    if (!categoryId || typeof categoryId !== "string" || !categoryId.trim()) {
      return fail("BAD_REQUEST", 400, "categoryId is required");
    }

    if (!requestText || typeof requestText !== "string" || !requestText.trim()) {
      return fail("BAD_REQUEST", 400, "requestText is required");
    }

    if (!sendMode || (sendMode !== "NETWORK" && sendMode !== "DIRECT")) {
      return fail("BAD_REQUEST", 400, "sendMode must be NETWORK or DIRECT");
    }

    // Validate DIRECT mode requirements
    if (sendMode === "DIRECT") {
      if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
        return fail("BAD_REQUEST", 400, "supplierIds array is required for DIRECT mode");
      }
    }

    // Normalize category ID
    const normalizedCategoryId = categoryId.trim().toLowerCase();

    // Resolve target suppliers
    let targetSuppliers: Array<{ id: string; name: string }> = [];

    if (sendMode === "NETWORK") {
      // NETWORK: Find all suppliers with matching category via SupplierCategoryLink
      const suppliers = await prisma.supplier.findMany({
        where: {
          categoryLinks: {
            some: {
              categoryId: normalizedCategoryId,
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: "asc" },
      });

      targetSuppliers = suppliers;
    } else {
      // DIRECT: Fetch only selected suppliers
      const supplierIdsArray = supplierIds as string[];
      const suppliers = await prisma.supplier.findMany({
        where: {
          id: { in: supplierIdsArray },
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Validate that all requested suppliers exist
      if (suppliers.length !== supplierIdsArray.length) {
        return fail("BAD_REQUEST", 400, "One or more supplier IDs are invalid");
      }

      targetSuppliers = suppliers;
    }

    if (targetSuppliers.length === 0) {
      return fail("BAD_REQUEST", 400, "No suppliers found for the specified criteria", {
        category_id: normalizedCategoryId,
        send_mode: sendMode.toLowerCase(),
      });
    }

    // Create MaterialRequest
    const materialRequest = await prisma.materialRequest.create({
      data: {
        buyerId: dbUser.id,
        categoryId: normalizedCategoryId,
        requestText: requestText.trim(),
        sendMode: sendMode,
        supplierIdsJson: sendMode === "DIRECT" ? JSON.stringify(supplierIds) : null,
      },
    });

    // For each target supplier, create a NEW request-specific conversation and send message
    // Use transactions per supplier to ensure atomicity
    const recipientResults: Array<{ supplierId: string; conversationId: string }> = [];

    // Generate a short title from request text (max ~80 chars)
    const conversationTitle = requestText.trim().substring(0, 80);
    const now = new Date();

    for (const supplier of targetSuppliers) {
      try {
        // Wrap per-supplier operations in a transaction for atomicity
        await prisma.$transaction(async (tx) => {
          // Create a NEW conversation for this material request (not the general thread)
          const conversation = await tx.supplierConversation.create({
            data: {
              buyerId: dbUser.id,
              supplierId: supplier.id,
              rfqId: null, // Material requests are not RFQ-scoped
              materialRequestId: materialRequest.id,
              title: conversationTitle,
            },
          });

          // Create the buyer message in this conversation
          await tx.supplierMessage.create({
            data: {
              conversationId: conversation.id,
              senderType: "BUYER",
              senderDisplayName: dbUser.fullName || dbUser.companyName || null,
              body: requestText.trim(),
            },
          });

          // Update conversation updatedAt and unhide for both sides (new activity)
          await tx.supplierConversation.update({
            where: { id: conversation.id },
            data: {
              updatedAt: now,
              hiddenForBuyerAt: null,
              hiddenForSupplierAt: null,
            },
          });

          // Create MaterialRequestRecipient with sentAt timestamp
          await tx.materialRequestRecipient.create({
            data: {
              materialRequestId: materialRequest.id,
              supplierId: supplier.id,
              conversationId: conversation.id,
              status: "SENT",
              sentAt: now,
              statusUpdatedAt: now,
            },
          });

          recipientResults.push({
            supplierId: supplier.id,
            conversationId: conversation.id,
          });
        });

        // Send notifications outside transaction (non-critical path)
        try {
          const conversationId = recipientResults[recipientResults.length - 1].conversationId;
          
          // Load supplier info for notifications
          const supplierInfo = await prisma.supplier.findUnique({
            where: { id: supplier.id },
            select: { id: true, name: true, email: true },
          });

          if (!supplierInfo) {
            console.warn("[MATERIAL_REQUEST_SUPPLIER_NOT_FOUND]", {
              materialRequestId: materialRequest.id,
              supplierId: supplier.id,
            });
            continue;
          }

          const buyerName = dbUser.fullName || dbUser.companyName || "Buyer";
          const messagePreview = requestText.trim().substring(0, 160);

          // Find ALL ACTIVE supplier members for this supplier
          const activeMembers = await prisma.supplierMember.findMany({
            where: {
              supplierId: supplier.id,
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
            if (supplierInfo.email) {
              try {
                await sendSupplierOnboardingEmail({
                  to: supplierInfo.email,
                  supplierName: supplierInfo.name,
                  buyerName: buyerName,
                  messagePreview: messagePreview,
                  conversationId: conversationId,
                  supplierId: supplier.id,
                });
              } catch (emailError) {
                console.error("[MATERIAL_REQUEST_FALLBACK_EMAIL_FAILED]", {
                  supplierId: supplier.id,
                  error: emailError instanceof Error ? emailError.message : String(emailError),
                });
              }
            }
            // Continue to next supplier
            continue;
          }

          // Notify each active member (group chat behavior)
          for (const member of activeMembers) {
            // Send email notification
            if (member.user.email) {
              try {
                await sendSupplierMessageEmail({
                  to: member.user.email,
                  supplierName: supplierInfo.name,
                  buyerName: buyerName,
                  conversationId: conversationId,
                  supplierId: supplier.id,
                  messagePreview: messagePreview,
                });
              } catch (emailError) {
                console.error("[MATERIAL_REQUEST_MEMBER_EMAIL_FAILED]", {
                  supplierId: supplier.id,
                  memberUserId: member.user.id,
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
                    conversationId: conversationId,
                    supplierId: supplier.id,
                    buyerId: dbUser.id,
                    buyerName: buyerName,
                    messagePreview: messagePreview,
                    urlPath: `/seller/messages?conversationId=${encodeURIComponent(conversationId)}`,
                  }),
                },
              });
            } catch (notificationError) {
              console.error("[MATERIAL_REQUEST_NOTIFICATION_CREATE_FAILED]", {
                memberUserId: member.user.id,
                supplierId: supplier.id,
                error: notificationError instanceof Error ? notificationError.message : String(notificationError),
              });
            }
          }
        } catch (notificationError) {
          // Log but don't fail - message was already created in transaction
          console.error("[MATERIAL_REQUEST_NOTIFICATION_ERROR]", {
            materialRequestId: materialRequest.id,
            supplierId: supplier.id,
            error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          });
        }
      } catch (error) {
        // Log error but continue with other suppliers
        console.error("[MATERIAL_REQUEST_SUPPLIER_ERROR]", {
          materialRequestId: materialRequest.id,
          supplierId: supplier.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log("[MATERIAL_REQUEST_CREATED]", {
      materialRequestId: materialRequest.id,
      buyerId: dbUser.id,
      categoryId: normalizedCategoryId,
      sendMode: sendMode,
      supplierCount: recipientResults.length,
    });

    await trackServerEvent(ANALYTICS_EVENTS.request_submitted, {
      category_id: normalizedCategoryId,
      send_mode: sendMode.toLowerCase(),
      recipient_count: recipientResults.length,
    });

    return NextResponse.json({
      ok: true,
      materialRequestId: materialRequest.id,
      supplierCount: recipientResults.length,
      supplierIds: recipientResults.map((r) => r.supplierId),
    });
  });
}


