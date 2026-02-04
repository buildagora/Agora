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

export interface NotifySellersRfq {
  id: string;
  rfqNumber: string;
  category: string;
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
      // Direct RFQ: only notify sellers in targetSupplierIds
      if (!rfq.targetSupplierIds || rfq.targetSupplierIds.length === 0) {
        console.log("📧 NO_TARGET_SUPPLIERS", {
          rfqId: rfq.id,
          visibility: "direct",
        });
        return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
      }

      // Query only the targeted sellers
      matchingSellers = await prisma.user.findMany({
        where: {
          role: "SELLER",
          id: {
            in: rfq.targetSupplierIds,
          },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          companyName: true,
        },
      });

      console.log("[SELLER_MATCHES_DIRECT]", {
        rfqId: rfq.id,
        visibility: "direct",
        targetSupplierIds: rfq.targetSupplierIds,
        matchingCount: matchingSellers.length,
        sellerIds: matchingSellers.map(s => s.id),
      });
    } else {
      // Broadcast RFQ: notify all sellers whose categoriesServed matches the RFQ category
    const allSellers = await prisma.user.findMany({
      where: {
        role: "SELLER",
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        companyName: true,
        categoriesServed: true,
      },
    });

      // Filter sellers whose categoriesServed includes the RFQ categoryId
      // CRITICAL: Use categoryId matching only (canonical ids like "roofing", "hvac")
      // RFQ.category should be a categoryId, seller.categoriesServed should be categoryIds
      const rfqCategoryId = rfq.category.trim(); // Should already be a categoryId
      
      // Validate RFQ category is a valid categoryId
      if (!CATEGORY_IDS.includes(rfqCategoryId as any)) {
        console.error("[SELLER_MATCHES_BROADCAST_INVALID_CATEGORY]", {
          rfqId: rfq.id,
          rfqCategory: rfq.category,
          message: "RFQ category is not a valid categoryId",
        });
        return { attempted: 0, sent: 0, skipped: 0, errors: 0 };
      }
      
      matchingSellers = allSellers.filter((seller) => {
      if (!seller.categoriesServed) {
        return false;
      }

      try {
          const sellerCategoryIds = JSON.parse(seller.categoriesServed);
          if (!Array.isArray(sellerCategoryIds)) {
          return false;
        }
          // CRITICAL: Exact match on categoryId (no label matching)
          return sellerCategoryIds.includes(rfqCategoryId);
      } catch {
        // Invalid JSON, skip this seller
        return false;
      }
    });
    
    // CRITICAL: Log seller matching (always, not just dev)
      console.log("[SELLER_MATCHES_BROADCAST]", {
      rfqId: rfq.id,
        rfqCategoryId: rfqCategoryId,
      totalSellers: allSellers.length,
      matchingCount: matchingSellers.length,
      sellerIds: matchingSellers.map(s => s.id),
    });
    }

    if (matchingSellers.length === 0) {
      console.log("📧 NO_MATCHING_SELLERS", {
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
      matchingCount: matchingSellers.length,
    });

    // IDEMPOTENCY GUARD: Check EmailEvent table to prevent duplicate emails
    // Use (rfqId + supplierId) as unique key
    const idempotencyMap = new Map<string, boolean>();
    
    // Pre-check existing EmailEvents for this RFQ
    const existingEvents = await prisma.emailEvent.findMany({
      where: {
        rfqId: rfq.id,
        status: { in: ["SENT", "OUTBOX"] }, // Only check successful/outbox events
      },
      select: {
        supplierId: true,
      },
    });

    // Build idempotency map
    for (const event of existingEvents) {
      if (event.supplierId) {
        idempotencyMap.set(`${rfq.id}:${event.supplierId}`, true);
      }
    }

    // Filter sellers with emails and prepare email tasks
    const emailTasks: Array<{
      seller: typeof matchingSellers[0];
      task: Promise<{ id: string }>;
    }> = [];

    for (const seller of matchingSellers) {
      // CRITICAL: Verify supplier email exists
      if (!seller.email) {
        skipped++;
        if (process.env.NODE_ENV === "development") {
          console.log("[SELLER_NO_EMAIL]", {
            sellerId: seller.id,
            rfqId: rfq.id,
            reason: "Seller has no email address",
          });
        }
        continue;
      }

      // IDEMPOTENCY CHECK: Skip if already sent
      const idempotencyKey = `${rfq.id}:${seller.id}`;
      if (idempotencyMap.has(idempotencyKey)) {
        skipped++;
        if (process.env.NODE_ENV === "development") {
          console.log("[RFQ_EMAIL_IDEMPOTENT_SKIP]", {
            sellerId: seller.id,
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
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const rfqUrl = `${baseUrl}/seller/rfqs/${rfq.id}`;
      
      emailBody += `
        <p><a href="${rfqUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View RFQ</a></p>
      `;

      // Prepare email task using sendEmail (same utility as Award/PO emails)
      const emailTask = (async () => {
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
                to: seller.email,
                subject,
                status: "OUTBOX",
                rfqId: rfq.id,
                supplierId: seller.id,
              },
            });

            console.log("[EMAIL_OUTBOX_CREATED]", {
              rfqId: rfq.id,
              supplierId: seller.id,
              supplierEmail: seller.email,
            });

            return { id: emailEventId };
          }

          // Production or dev with email config: send actual email
          const result = await sendEmail({
            to: seller.email,
            subject,
            html: emailBody,
          });

          // Write EmailEvent to database (authoritative record)
          await prisma.emailEvent.create({
            data: {
              id: emailEventId,
              to: seller.email,
              subject,
              status: "SENT",
              providerMessageId: result.id,
              rfqId: rfq.id,
              supplierId: seller.id,
            },
          });

          console.log("[RFQ_EMAIL_SENT]", {
            rfqId: rfq.id,
            supplierId: seller.id,
            supplierEmail: seller.email,
          });

          return result;
        } catch (error: any) {
          const errorDetails = error.message || "Unknown error";

          // Write EmailEvent to database (authoritative record for failures)
          await prisma.emailEvent.create({
            data: {
              id: emailEventId,
              to: seller.email,
              subject,
              status: "FAILED",
              error: errorDetails,
              rfqId: rfq.id,
              supplierId: seller.id,
            },
          });

          console.error("[RFQ_EMAIL_FAILED]", {
            rfqId: rfq.id,
            supplierId: seller.id,
            error: errorDetails,
          });

          throw error;
        }
      })();

      emailTasks.push({ seller, task: emailTask });
    }

    // Send emails with concurrency limit using Promise.allSettled
    const CONCURRENCY_LIMIT = 10;
    const results: Array<{
      seller: typeof matchingSellers[0];
      status: "fulfilled" | "rejected";
      value?: { id: string };
      reason?: Error;
    }> = [];

    // Process in batches
    for (let i = 0; i < emailTasks.length; i += CONCURRENCY_LIMIT) {
      const batch = emailTasks.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(({ task }) => task)
      );

      // Map results back to sellers
      for (let j = 0; j < batch.length; j++) {
        const { seller } = batch[j];
        const result = batchResults[j];
        
        if (result.status === "fulfilled") {
          sent++;
          // EmailEvent already logged in emailTask
        } else {
          errors++;
          // EmailEvent already logged in emailTask (status: FAILED)
        }
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
