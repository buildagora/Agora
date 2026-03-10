/**
 * Server-side function to notify sellers when a new RFQ is created
 * Queries sellers from database and sends email notifications directly via Resend
 * 
 * This module is safe to import from:
 * - Next.js API route handlers
 * - Node.js scripts (via tsx)
 * 
 * It must NOT be imported from client components (enforced by usage patterns).
 */

import { getPrisma } from "@/lib/db.server";
import { sendEmail } from "@/lib/email.server";
import { CATEGORY_IDS } from "@/lib/categoryDisplay";
import { getBaseUrl } from "@/lib/urls/baseUrl.server";
import crypto from "crypto";

export interface NotifySellersRfq {
  id: string;
  rfqNumber: string;
  category: string; // Display label (e.g., "Roofing") - for backward compatibility
  categoryId?: string; // CRITICAL: Canonical categoryId (e.g., "roofing") - use this for routing/notifications
  title: string;
  notes?: string;
  createdAt: string;
  terms: {
    requestedDate?: string;
    location?: string;
  };
  buyerName?: string;
  visibility?: "broadcast" | "direct";
  targetSupplierIds?: string[]; // For direct RFQs
}

export interface NotifySellersResult {
  attempted: number;
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Notify sellers about a new RFQ
 * - For broadcast RFQs: notify all sellers whose categoriesServed matches the RFQ category
 * - For direct RFQs: notify only sellers whose ids are in targetSupplierIds
 * This is a server-side function that queries the database and sends emails
 */
export async function notifySellersOfNewRfq(
  rfq: NotifySellersRfq
): Promise<NotifySellersResult> {
  const prisma = getPrisma();
  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const visibility = rfq.visibility || "broadcast"; // Default to broadcast

  try {
    let matchingSellers: Array<{
      id: string;
      email: string | null;
      fullName: string | null;
      companyName: string | null;
    }> = [];

    if (visibility === "direct") {
      // Direct RFQ: targetSupplierIds contains supplier organization IDs
      // We'll expand to all ACTIVE members below, so matchingSellers is not used for direct RFQs
      if (!rfq.targetSupplierIds || rfq.targetSupplierIds.length === 0) {
        console.log("📧 NO_TARGET_SUPPLIERS", {
          rfqId: rfq.id,
          visibility: "direct",
        });
        return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
      }

      // For direct RFQs, targetSupplierIds are supplier org IDs
      // We'll expand to members in the org-scoped expansion below
      // Create a placeholder list - actual expansion happens via SupplierMember lookup
      matchingSellers = [];

      console.log("[SELLER_MATCHES_DIRECT]", {
        rfqId: rfq.id,
        visibility: "direct",
        targetSupplierIds: rfq.targetSupplierIds,
        message: "targetSupplierIds are supplier org IDs, will expand to ACTIVE members",
      });
    } else {
      // Broadcast RFQ: resolve supplier orgs by category using SupplierCategoryLink (org-scoped)
      // CRITICAL: RFQ.category is display label (e.g., "Roofing"), RFQ.categoryId is canonical routing key (e.g., "roofing")
      // Notifications/routing must use categoryId for SupplierCategoryLink matching
      const rfqCategoryId = rfq.categoryId?.trim() || rfq.category.trim().toLowerCase();
      
      // Validate RFQ category is a valid categoryId
      if (!CATEGORY_IDS.includes(rfqCategoryId as any)) {
        console.error("[SELLER_MATCHES_BROADCAST_INVALID_CATEGORY]", {
          rfqId: rfq.id,
          rfqCategory: rfq.category,
          rfqCategoryId: rfq.categoryId,
          normalizedCategoryId: rfqCategoryId,
          message: "RFQ category is not a valid categoryId",
        });
        return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
      }

      // Find supplier orgs matching the RFQ category using SupplierCategoryLink (canonical source)
      const categoryLinks = await prisma.supplierCategoryLink.findMany({
        where: {
          categoryId: rfqCategoryId, // Match by canonical categoryId
        },
        select: {
          supplierId: true,
        },
      });

      let supplierOrgIds: string[] = categoryLinks.map(link => link.supplierId);

      // Legacy fallback: if no category links found, try to find suppliers by category label
      if (supplierOrgIds.length === 0) {
        const suppliersByLabel = await prisma.supplier.findMany({
          where: {
            category: rfq.category.toUpperCase(), // ROOFING, etc. (display/legacy uppercase form)
          },
          select: {
            id: true,
          },
        });
        supplierOrgIds = suppliersByLabel.map(s => s.id);
      }

      // For broadcast RFQs, we'll expand to all ACTIVE members below
      // Create placeholder list - actual expansion happens via SupplierMember lookup
      matchingSellers = [];

      console.log("[SELLER_MATCHES_BROADCAST]", {
        rfqId: rfq.id,
        rfqCategoryId: rfqCategoryId,
        supplierOrgCount: supplierOrgIds.length,
        message: "Using SupplierCategoryLink for org-scoped category matching",
      });
    }

    // For broadcast RFQs, matchingSellers is empty (we expand via memberships)
    // For direct RFQs, matchingSellers is also empty (we expand via memberships)
    // The actual recipient expansion happens below via SupplierMember lookup
    // So we don't check matchingSellers.length here anymore

    // IDEMPOTENCY GUARD: Check EmailEvent table to prevent duplicate emails
    // Use (rfqId + supplierOrgId + recipientEmail) as unique key
    const idempotencyMap = new Map<string, boolean>();
    
    // Pre-check existing EmailEvents for this RFQ
    const existingEvents = await prisma.emailEvent.findMany({
      where: {
        rfqId: rfq.id,
        status: { in: ["SENT", "OUTBOX"] }, // Only check successful/outbox events
      },
      select: {
        supplierId: true,
        to: true,
      },
    });

    // Build idempotency map: key = rfqId:supplierOrgId:recipientEmail
    for (const event of existingEvents) {
      if (event.supplierId && event.to) {
        const idempotencyKey = `${rfq.id}:${event.supplierId}:${event.to}`;
        idempotencyMap.set(idempotencyKey, true);
      }
    }

    // ORG-SCOPED: Resolve supplier orgs and expand to all ACTIVE members
    let memberships;
    
    if (visibility === "direct") {
      // Direct RFQ: targetSupplierIds are supplier org IDs
      // Query all ACTIVE members for these supplier orgs
      memberships = await prisma.supplierMember.findMany({
        where: {
          supplierId: { in: rfq.targetSupplierIds },
          status: "ACTIVE",
        },
        include: {
          supplier: {
            select: { id: true, name: true },
          },
          user: {
            select: { id: true, email: true },
          },
        },
      });
    } else {
      // Broadcast RFQ: resolve supplier orgs by category using SupplierCategoryLink
      // CRITICAL: RFQ.category is display label (e.g., "Roofing"), RFQ.categoryId is canonical routing key (e.g., "roofing")
      // Notifications/routing must use categoryId for SupplierCategoryLink matching
      const rfqCategoryId = rfq.categoryId?.trim() || rfq.category.trim().toLowerCase();
      
      // Find supplier orgs matching the RFQ category
      const categoryLinks = await prisma.supplierCategoryLink.findMany({
        where: {
          categoryId: rfqCategoryId, // Match by canonical categoryId
        },
        select: {
          supplierId: true,
        },
      });

      let supplierOrgIds: string[] = categoryLinks.map(link => link.supplierId);

      // Legacy fallback: if no category links found, try to find suppliers by category label
      if (supplierOrgIds.length === 0) {
        const suppliersByLabel = await prisma.supplier.findMany({
          where: {
            category: rfq.category.toUpperCase(), // ROOFING, etc. (display/legacy uppercase form)
          },
          select: {
            id: true,
          },
        });
        supplierOrgIds = suppliersByLabel.map(s => s.id);
      }

      // Query all ACTIVE members for these supplier orgs
      memberships = await prisma.supplierMember.findMany({
        where: {
          supplierId: { in: supplierOrgIds },
          status: "ACTIVE",
        },
        include: {
          supplier: {
            select: { id: true, name: true },
          },
          user: {
            select: { id: true, email: true },
          },
        },
      });
    }

    // If no memberships found, return early
    if (memberships.length === 0) {
      console.log("📧 NO_MATCHING_SUPPLIERS", {
        rfqId: rfq.id,
        category: rfq.category,
        visibility,
      });
      return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
    }

    // CRITICAL: Log recipient selection summary (always, not just dev)
    console.log("[RFQ_NOTIFICATION_RECIPIENTS]", {
      rfqId: rfq.id,
      visibility,
      category: rfq.category,
      membershipCount: memberships.length,
    });

    // Group members by supplier org
    const orgMembersMap = new Map<string, Array<{
      userId: string;
      email: string | null;
      supplierId: string;
      supplierName: string;
    }>>();

    for (const membership of memberships) {
      const orgId = membership.supplierId;
      if (!orgMembersMap.has(orgId)) {
        orgMembersMap.set(orgId, []);
      }
      orgMembersMap.get(orgId)!.push({
        userId: membership.userId,
        email: membership.user.email,
        supplierId: membership.supplier.id,
        supplierName: membership.supplier.name,
      });
    }

    // Filter recipients and prepare email tasks
    // CRITICAL: Store functions that return promises, not promises themselves
    // This allows batching to control when emails actually start sending
    const emailTasks: Array<{
      recipientEmail: string;
      supplierOrgId: string;
      supplierName: string;
      memberUserId: string;
      task: () => Promise<{ id: string }>;
    }> = [];

    // For each supplier org, send email to all ACTIVE members
    for (const [supplierOrgId, members] of orgMembersMap.entries()) {
      const supplierName = members[0]?.supplierName || "Supplier";
      
      for (const member of members) {
        // CRITICAL: Verify member email exists
        if (!member.email) {
          skipped++;
          if (process.env.NODE_ENV === "development") {
            console.log("[SUPPLIER_MEMBER_NO_EMAIL]", {
              memberUserId: member.userId,
              supplierOrgId,
              rfqId: rfq.id,
              reason: "Member has no email address",
            });
          }
          continue;
        }

        // IDEMPOTENCY CHECK: Skip if already sent to this org + recipient
        const idempotencyKey = `${rfq.id}:${supplierOrgId}:${member.email}`;
        if (idempotencyMap.has(idempotencyKey)) {
          skipped++;
          if (process.env.NODE_ENV === "development") {
            console.log("[RFQ_EMAIL_IDEMPOTENT_SKIP]", {
              supplierOrgId,
              recipientEmail: member.email,
              rfqId: rfq.id,
              reason: "Email already sent (idempotent)",
            });
          }
          continue;
        }

        attempted++;
        idempotencyMap.set(idempotencyKey, true); // Mark as in-flight

      // Build email content (same pattern as Award/PO emails)
      const subject = `New RFQ: ${rfq.title}`;
      
      let emailBody = `
        <h2>New RFQ Available</h2>
        <p><strong>Category:</strong> ${rfq.category}</p>
        <p><strong>Title:</strong> ${rfq.title}</p>
        <p><strong>RFQ Number:</strong> ${rfq.rfqNumber}</p>
      `;

      if (rfq.buyerName) {
        emailBody += `<p><strong>Buyer:</strong> ${rfq.buyerName}</p>`;
      }

      if (rfq.notes) {
        emailBody += `<p><strong>Description:</strong> ${rfq.notes}</p>`;
      }

      if (rfq.terms.requestedDate) {
        const dueDate = new Date(rfq.terms.requestedDate);
        emailBody += `<p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>`;
      }

      if (rfq.terms.location) {
        emailBody += `<p><strong>Location:</strong> ${rfq.terms.location}</p>`;
      }

      // Build URL - link to specific RFQ detail page (deterministic deep link)
      const baseUrl = getBaseUrl();
      const rfqUrl = `${baseUrl}/seller/rfqs/${rfq.id}`;
      
      emailBody += `
        <p><a href="${rfqUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View RFQ</a></p>
      `;

        // Prepare email task using sendEmail (same utility as Award/PO emails)
        // CRITICAL: Return a function that creates the promise, not an immediately invoked function
        // This allows batching to control when emails actually start sending
        const emailTask = async () => {
          // Guard: skip if member has no email (capture to local const for TypeScript narrowing)
          const toEmail = member.email ?? null;
          if (!toEmail) {
            return { id: "" };
          }

          const apiKey = process.env.RESEND_API_KEY;
          const emailFrom = process.env.EMAIL_FROM;
          const hasEmailConfig = !!(apiKey && apiKey.startsWith("re_") && emailFrom);
          const isDev = process.env.NODE_ENV === "development";
          let emailEventId = crypto.randomUUID();

          try {
            if (isDev && !hasEmailConfig) {
              // DEV FALLBACK: Log to outbox (same as other flows)
              await prisma.emailEvent.create({
                data: {
                  id: emailEventId,
                  to: toEmail,
                  subject,
                  status: "OUTBOX",
                  rfqId: rfq.id,
                  supplierId: supplierOrgId, // Store supplier ORG id, not user id
                },
              });

              console.log("[EMAIL_OUTBOX_CREATED]", {
                rfqId: rfq.id,
                supplierOrgId,
                recipientEmail: toEmail,
                memberUserId: member.userId,
              });

              return { id: emailEventId };
            }

            // Production or dev with email config: send actual email
            const result = await sendEmail({
              to: toEmail,
              subject,
              html: emailBody,
            });

            // Write EmailEvent to database (authoritative record)
            await prisma.emailEvent.create({
              data: {
                id: emailEventId,
                to: toEmail,
                subject,
                status: "SENT",
                providerMessageId: result.id,
                rfqId: rfq.id,
                supplierId: supplierOrgId, // Store supplier ORG id, not user id
              },
            });

            console.log("[RFQ_EMAIL_SENT]", {
              rfqId: rfq.id,
              supplierOrgId,
              recipientEmail: toEmail,
              memberUserId: member.userId,
            });

            return result;
          } catch (error: any) {
            const errorDetails = error.message || "Unknown error";

            // Write EmailEvent to database (authoritative record for failures)
            await prisma.emailEvent.create({
              data: {
                id: emailEventId,
                to: toEmail,
                subject,
                status: "FAILED",
                error: errorDetails,
                rfqId: rfq.id,
                supplierId: supplierOrgId, // Store supplier ORG id, not user id
              },
            });

            console.error("[RFQ_EMAIL_FAILED]", {
              rfqId: rfq.id,
              supplierOrgId,
              recipientEmail: toEmail,
              memberUserId: member.userId,
              error: errorDetails,
            });

            throw error;
          }
        };

        emailTasks.push({
          recipientEmail: member.email!,
          supplierOrgId,
          supplierName,
          memberUserId: member.userId,
          task: emailTask,
        });
      }
    }

    // Send emails with rate-safe batching to respect Resend's 2 requests/second limit
    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 1000;

    const sleep = (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms));

    // Log batch start
    console.log("[RFQ_EMAIL_BATCH_START]", {
      rfqId: rfq.id,
      totalRecipients: emailTasks.length,
    });

    // Process in batches with rate limiting
    // CRITICAL: Call the task function here to start the promise only when batching
    for (let i = 0; i < emailTasks.length; i += BATCH_SIZE) {
      const batch = emailTasks.slice(i, i + BATCH_SIZE);

      // Log batch details
      console.log("[RFQ_EMAIL_BATCH]", {
        rfqId: rfq.id,
        batchStart: i,
        batchSize: batch.length,
        recipients: batch.map(t => t.recipientEmail),
      });

      const batchResults = await Promise.allSettled(
        batch.map(({ task }) => task())
      );

      // Map results back to recipients
      for (let j = 0; j < batch.length; j++) {
        const result = batchResults[j];
        
        if (result.status === "fulfilled") {
          sent++;
          // EmailEvent already logged in emailTask
        } else {
          errors++;
          // EmailEvent already logged in emailTask (status: FAILED)
        }
      }

      // Pause between batches to respect Resend rate limits (2 requests/second)
      // Only pause if there are more batches to process
      if (i + BATCH_SIZE < emailTasks.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // CRITICAL: Always log final stats (especially in development)
    const stats = { attempted, sent, skipped, errors };
    console.log("📧 SUPPLIER_NOTIFICATIONS", {
      rfqId: rfq.id,
      attempted,
      sent,
      skipped,
      errors,
    });

    return stats;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ NOTIFY_SELLERS_ERROR", {
      rfqId: rfq.id,
      error: errorMessage,
    });
    return { attempted, sent, skipped, errors: errors + 1 };
  }
}
