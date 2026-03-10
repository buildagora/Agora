/**
 * Server-side Resend email utilities for RFQ notifications
 * 
 * This module is safe to import from:
 * - Next.js API route handlers
 * - Node.js scripts (via tsx)
 * 
 * It must NOT be imported from client components (enforced by usage patterns).
 */

import { getResendClient } from "@/lib/server/resend";
import { getBaseUrl } from "@/lib/urls/baseUrl.server";
import { getPrisma } from "@/lib/db.server";

export interface SendRfqCreatedEmailParams {
  to: string;
  supplierName: string;
  rfq: {
    id: string;
    rfqNumber: string;
    category: string;
    title: string;
    description?: string;
    buyerName?: string;
    dueAt?: string;
    location?: string;
    urlPath?: string;
  };
}

/**
 * Get Resend client instance
 * Uses process.env.RESEND_API_KEY (not NEXT_PUBLIC_RESEND_API_KEY)
 */
export function getResendClientForNotifications() {
  return getResendClient();
}

/**
 * Send RFQ created email notification to a supplier
 * Uses process.env.EMAIL_FROM for from address
 * 
 * @throws Error if configuration is missing or send fails
 */
export async function sendRfqCreatedEmail(
  params: SendRfqCreatedEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  if (isDev && devOverride && params.to !== devOverride) {
    // Validate override email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(devOverride)) {
      console.log("[EMAIL_TO_OVERRIDDEN]", {
        originalTo: params.to,
        overrideTo: devOverride,
        rfqId: params.rfq.id,
      });
    } else {
      console.warn("[EMAIL_OVERRIDE_INVALID]", {
        devOverride,
        message: "DEV_EMAIL_OVERRIDE is not a valid email, using original recipient",
      });
    }
  }

  // Build email content
  const subject = `New RFQ in ${params.rfq.category}: ${params.rfq.title}`;
  
  let emailBody = `
    <h2>New RFQ Available</h2>
    <p><strong>Category:</strong> ${params.rfq.category}</p>
    <p><strong>Title:</strong> ${params.rfq.title}</p>
    <p><strong>RFQ Number:</strong> ${params.rfq.rfqNumber}</p>
  `;

  if (params.rfq.buyerName) {
    emailBody += `<p><strong>Buyer:</strong> ${params.rfq.buyerName}</p>`;
  }

  if (params.rfq.description) {
    emailBody += `<p><strong>Description:</strong> ${params.rfq.description}</p>`;
  }

  if (params.rfq.dueAt) {
    const dueDate = new Date(params.rfq.dueAt);
    emailBody += `<p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>`;
  }

  if (params.rfq.location) {
    emailBody += `<p><strong>Location:</strong> ${params.rfq.location}</p>`;
  }

  // Build URL - link to seller feed filtered by category
  const baseUrl = getBaseUrl();
  let feedUrl = params.rfq.urlPath 
    ? `${baseUrl}${params.rfq.urlPath}`
    : `${baseUrl}/seller/feed?category=${encodeURIComponent(params.rfq.category)}`;
  
  // Tag email links with from=email query param for history seeding (only if not already present)
  if (!feedUrl.includes("from=email")) {
    feedUrl += feedUrl.includes("?") ? "&from=email" : "?from=email";
  }
  
  // Dev-only logging for email link debugging
  if (process.env.NODE_ENV !== "production") {
    console.log("[EMAIL_LINK]", { baseUrl, feedUrl });
  }
  
  emailBody += `
    <p><a href="${feedUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View RFQ</a></p>
  `;

  // OPTIONAL: Add admin BCC if configured
  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  // CRITICAL: Log resolved recipient before sending (always, not just dev)
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    rfqId: params.rfq.id,
  });

  // Send email via Resend
  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}

export interface SendSupplierOnboardingEmailParams {
  to: string;
  supplierName: string;
  buyerName: string;
  messagePreview: string;
  conversationId?: string; // Optional: for message-based onboarding
  rfqId?: string; // Optional: for RFQ-based onboarding
  supplierId: string;
}

/**
 * Send supplier onboarding email when buyer messages a supplier with no active members
 * Explains that a buyer is trying to connect and they need to create/claim an account
 */
export async function sendSupplierOnboardingEmail(
  params: SendSupplierOnboardingEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  if (isDev && devOverride && params.to !== devOverride) {
    // Validate override email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(devOverride)) {
      console.log("[EMAIL_TO_OVERRIDDEN]", {
        originalTo: params.to,
        overrideTo: devOverride,
        supplierId: params.supplierId,
      });
    } else {
      console.warn("[EMAIL_OVERRIDE_INVALID]", {
        devOverride,
        message: "DEV_EMAIL_OVERRIDE is not a valid email, using original recipient",
      });
    }
  }

  // Build email content
  const subject = `${params.buyerName || "A buyer"} is trying to reach ${params.supplierName} on Agora`;
  
  // HTML escape function
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const escapedPreview = escapeHtml(params.messagePreview);
  const escapedBuyerName = escapeHtml(params.buyerName || "a buyer");
  const escapedSupplierName = escapeHtml(params.supplierName);
  
  // Build URL - link to seller signup/claim page
  const baseUrl = getBaseUrl();
  const signupUrl = `${baseUrl}/seller/signup?supplier=${encodeURIComponent(params.supplierId)}`;
  
  let emailBody = `
    <h2>${escapedBuyerName} is trying to reach you on Agora</h2>
    <p><strong>${escapedBuyerName}</strong> sent a message to <strong>${escapedSupplierName}</strong> on Agora, but your supplier account doesn't have any active team members yet.</p>
    <p><strong>Message Preview:</strong></p>
    <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0;">${escapedPreview}</p>
    <p>To view and respond to this message, you need to create or claim your supplier account on Agora.</p>
    <p style="margin-top: 20px;">
      <a href="${signupUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">Create Account on Agora</a>
    </p>
    <p style="font-size: 0.8em; color: #666; margin-top: 20px;">
      If you already have an account, sign in and claim your supplier profile to view messages.
    </p>
    <p style="font-size: 0.8em; color: #666; margin-top: 10px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      ${signupUrl}
    </p>
  `;

  // OPTIONAL: Add admin BCC if configured
  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  // Log resolved recipient before sending
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    supplierId: params.supplierId,
    conversationId: params.conversationId || null,
    rfqId: params.rfqId || null,
  });

  const prisma = getPrisma();

  // Send email via Resend and create EmailEvent record
  let emailEventCreated = false;
  try {
    const response = await resend.emails.send(emailOptions);

    if (response.error) {
      // Create FAILED EmailEvent before throwing
      await prisma.emailEvent.create({
        data: {
          to: finalTo,
          subject: subject,
          status: "FAILED",
          providerMessageId: null,
          error: `Resend error: ${response.error.message || "Unknown error"}`,
          supplierId: params.supplierId,
        },
      });
      emailEventCreated = true;
      throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
    }

    if (!response.data?.id) {
      // Create FAILED EmailEvent before throwing
      await prisma.emailEvent.create({
        data: {
          to: finalTo,
          subject: subject,
          status: "FAILED",
          providerMessageId: null,
          error: "Resend returned success but no message ID",
          supplierId: params.supplierId,
        },
      });
      emailEventCreated = true;
      throw new Error("Resend returned success but no message ID");
    }

    // Create SENT EmailEvent on success
    await prisma.emailEvent.create({
      data: {
        to: finalTo,
        subject: subject,
        status: "SENT",
        providerMessageId: response.data.id,
        error: null,
        supplierId: params.supplierId,
      },
    });
    emailEventCreated = true;

    return { id: response.data.id };
  } catch (error) {
    // If error wasn't already handled above, create FAILED EmailEvent
    if (!emailEventCreated) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      try {
        await prisma.emailEvent.create({
          data: {
            to: finalTo,
            subject: subject,
            status: "FAILED",
            providerMessageId: null,
            error: errorMessage,
            supplierId: params.supplierId,
          },
        });
      } catch (dbError) {
        // Log but don't fail if EmailEvent creation fails
        console.error("[EMAIL_EVENT_CREATE_FAILED]", {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          originalError: errorMessage,
          supplierId: params.supplierId,
        });
      }
    }
    
    // Rethrow so route-level error handling can log
    throw error;
  }
}

export interface SendBidSubmittedEmailParams {
  to: string;
  buyerName: string;
  rfqNumber: string;
  rfqTitle: string;
  sellerName: string;
  bidTotal: number;
  link: string;
}

/**
 * Send bid submitted email notification to buyer
 * Uses process.env.EMAIL_FROM for from address
 * 
 * @throws Error if configuration is missing or send fails
 */
export async function sendBidSubmittedEmail(
  params: SendBidSubmittedEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  if (isDev && devOverride && params.to !== devOverride) {
    // Validate override email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(devOverride)) {
      console.log("[EMAIL_TO_OVERRIDDEN]", {
        originalTo: params.to,
        overrideTo: devOverride,
        rfqId: params.link.split("/").pop() || "unknown",
      });
    } else {
      console.warn("[EMAIL_OVERRIDE_INVALID]", {
        devOverride,
        message: "DEV_EMAIL_OVERRIDE is not a valid email, using original recipient",
      });
    }
  }

  // Build email content
  const subject = `New Bid Received for RFQ ${params.rfqNumber}: ${params.rfqTitle}`;
  
  let emailBody = `
    <h2>New Bid Received</h2>
    <p><strong>RFQ Number:</strong> ${params.rfqNumber}</p>
    <p><strong>RFQ Title:</strong> ${params.rfqTitle}</p>
    <p><strong>Seller:</strong> ${params.sellerName}</p>
    <p><strong>Bid Total:</strong> $${params.bidTotal.toFixed(2)}</p>
  `;

  // Build URL
  const baseUrl = getBaseUrl();
  const viewUrl = params.link.startsWith("http") ? params.link : `${baseUrl}${params.link}`;
  
  emailBody += `
    <p><a href="${viewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View Bid</a></p>
  `;

  // OPTIONAL: Add admin BCC if configured
  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  // CRITICAL: Log resolved recipient before sending (always, not just dev)
  const rfqId = params.link.split("/").pop() || "unknown";
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    rfqId,
    bidId: "pending",
  });

  // Send email via Resend
  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}

export interface SendAwardMadeEmailParams {
  to: string;
  sellerName: string;
  rfqNumber: string;
  rfqTitle: string;
  buyerName: string;
  bidTotal: number;
  orderId: string;
  link: string;
}

/**
 * Send award made email notification to seller
 */
export async function sendAwardMadeEmail(
  params: SendAwardMadeEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error("EMAIL_FROM is not set");
  }

  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  const subject = `Your Bid Was Awarded - RFQ ${params.rfqNumber}`;
  
  let emailBody = `
    <h2>Congratulations! Your Bid Was Awarded</h2>
    <p><strong>RFQ Number:</strong> ${params.rfqNumber}</p>
    <p><strong>RFQ Title:</strong> ${params.rfqTitle}</p>
    <p><strong>Buyer:</strong> ${params.buyerName}</p>
    <p><strong>Bid Total:</strong> $${params.bidTotal.toFixed(2)}</p>
    <p><strong>Order ID:</strong> ${params.orderId}</p>
  `;

  const baseUrl = getBaseUrl();
  const viewUrl = params.link.startsWith("http") ? params.link : `${baseUrl}${params.link}`;
  
  emailBody += `
    <p><a href="${viewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View Order</a></p>
  `;

  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  const rfqId = params.link.split("/").pop() || "unknown";
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    rfqId,
    orderId: params.orderId,
  });

  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}

export interface SendAwardConfirmationEmailParams {
  to: string;
  buyerName: string;
  rfqNumber: string;
  rfqTitle: string;
  sellerName: string;
  bidTotal: number;
  orderId: string;
  link: string;
}

/**
 * Send award confirmation email notification to buyer
 */
export async function sendAwardConfirmationEmail(
  params: SendAwardConfirmationEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error("EMAIL_FROM is not set");
  }

  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  const subject = `Order Created - RFQ ${params.rfqNumber}`;
  
  let emailBody = `
    <h2>Order Created Successfully</h2>
    <p><strong>RFQ Number:</strong> ${params.rfqNumber}</p>
    <p><strong>RFQ Title:</strong> ${params.rfqTitle}</p>
    <p><strong>Seller:</strong> ${params.sellerName}</p>
    <p><strong>Order Total:</strong> $${params.bidTotal.toFixed(2)}</p>
    <p><strong>Order ID:</strong> ${params.orderId}</p>
  `;

  const baseUrl = getBaseUrl();
  const viewUrl = params.link.startsWith("http") ? params.link : `${baseUrl}${params.link}`;
  
  emailBody += `
    <p><a href="${viewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View Order</a></p>
  `;

  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  const rfqId = params.link.split("/").pop() || "unknown";
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    rfqId,
    orderId: params.orderId,
  });

  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}

export interface SendBidAwardedEmailParams {
  to: string;
  sellerName: string;
  rfqNumber: string;
  rfqTitle: string;
  buyerName: string;
  bidTotal: number;
  link: string;
}

/**
 * Send bid awarded email notification to seller
 */
export async function sendBidAwardedEmail(
  params: SendBidAwardedEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error("EMAIL_FROM is not set");
  }

  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  const subject = `Your Bid Was Awarded - RFQ ${params.rfqNumber}`;
  
  let emailBody = `
    <h2>Congratulations! Your Bid Was Awarded</h2>
    <p><strong>RFQ Number:</strong> ${params.rfqNumber}</p>
    <p><strong>RFQ Title:</strong> ${params.rfqTitle}</p>
    <p><strong>Buyer:</strong> ${params.buyerName}</p>
    <p><strong>Bid Total:</strong> $${params.bidTotal.toFixed(2)}</p>
  `;

  const baseUrl = getBaseUrl();
  const viewUrl = params.link.startsWith("http") ? params.link : `${baseUrl}${params.link}`;
  
  emailBody += `
    <p><a href="${viewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View RFQ</a></p>
  `;

  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  const rfqId = params.link.split("/").pop() || "unknown";
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    rfqId,
    bidId: "pending",
  });

  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}

export interface SendPoGeneratedEmailParams {
  to: string;
  sellerName: string;
  orderNumber: string;
  rfqNumber: string;
  rfqTitle: string;
  buyerName: string;
  orderTotal: number;
  link: string;
}

/**
 * Send PO generated email notification to seller
 * 
 * CRITICAL: params.link MUST start with /seller/ to prevent cross-discipline contamination.
 * This ensures supplier emails never redirect buyers to seller routes.
 */
export async function sendPoGeneratedEmail(
  params: SendPoGeneratedEmailParams
): Promise<{ id: string }> {
  // CRITICAL: Guardrail to prevent cross-discipline contamination
  // Supplier PO emails must link to seller routes, never buyer routes
  if (!params.link.startsWith("/seller/")) {
    throw new Error(
      `sendPoGeneratedEmail: link must start with "/seller/" but got "${params.link}". ` +
      "This prevents cross-discipline contamination (buyer clicking seller link)."
    );
  }

  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error("EMAIL_FROM is not set");
  }

  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  const subject = `Purchase Order Generated - RFQ ${params.rfqNumber}`;
  
  let emailBody = `
    <h2>Purchase Order Generated</h2>
    <p><strong>RFQ Number:</strong> ${params.rfqNumber}</p>
    <p><strong>RFQ Title:</strong> ${params.rfqTitle}</p>
    <p><strong>Order Number:</strong> ${params.orderNumber}</p>
    <p><strong>Buyer:</strong> ${params.buyerName}</p>
    <p><strong>Order Total:</strong> $${params.orderTotal.toFixed(2)}</p>
  `;

  const baseUrl = getBaseUrl();
  const viewUrl = params.link.startsWith("http") ? params.link : `${baseUrl}${params.link}`;
  
  emailBody += `
    <p><a href="${viewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View Order</a></p>
  `;

  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  const rfqId = params.link.split("/").pop() || "unknown";
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    rfqId,
    orderId: params.orderNumber,
  });

  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}

export interface SendSupplierMessageEmailParams {
  to: string;
  supplierName: string;
  buyerName: string;
  conversationId: string;
  supplierId: string;
  messagePreview: string;
}

export interface SendBuyerNewMessageEmailParams {
  to: string;
  buyerName: string;
  supplierName: string;
  conversationId: string;
  supplierId: string;
  messagePreview: string;
}

/**
 * Send supplier message email notification
 * Uses process.env.EMAIL_FROM for from address
 * 
 * @throws Error if configuration is missing or send fails
 */
export async function sendSupplierMessageEmail(
  params: SendSupplierMessageEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  if (isDev && devOverride && params.to !== devOverride) {
    // Validate override email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(devOverride)) {
      console.log("[EMAIL_TO_OVERRIDDEN]", {
        originalTo: params.to,
        overrideTo: devOverride,
        conversationId: params.conversationId,
      });
    } else {
      console.warn("[EMAIL_OVERRIDE_INVALID]", {
        devOverride,
        message: "DEV_EMAIL_OVERRIDE is not a valid email, using original recipient",
      });
    }
  }

  // Build email content
  const subject = `New message from ${params.buyerName || "a buyer"} on Agora`;
  
  // HTML escape function for message preview
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const escapedPreview = escapeHtml(params.messagePreview);
  
  let emailBody = `
    <h2>New Message from ${escapeHtml(params.buyerName || "a buyer")}</h2>
    <p><strong>Supplier:</strong> ${escapeHtml(params.supplierName)}</p>
    <p><strong>Buyer:</strong> ${escapeHtml(params.buyerName || "a buyer")}</p>
    <p><strong>Message Preview:</strong></p>
    <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0;">${escapedPreview}</p>
  `;

  // Build URL - link to seller messages page
  const baseUrl = getBaseUrl();
  const inboxUrl = `${baseUrl}/seller/messages?conversationId=${encodeURIComponent(params.conversationId)}&from=email`;
  
  // Dev-only logging for email link debugging
  if (process.env.NODE_ENV !== "production") {
    console.log("[EMAIL_LINK]", { baseUrl, inboxUrl });
  }
  
  emailBody += `
    <p><a href="${inboxUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">Reply in Agora</a></p>
  `;

  // OPTIONAL: Add admin BCC if configured
  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  // CRITICAL: Log resolved recipient before sending (always, not just dev)
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    conversationId: params.conversationId,
    supplierId: params.supplierId,
  });

  const prisma = getPrisma();

  // Send email via Resend and create EmailEvent record
  let emailEventCreated = false;
  try {
    const response = await resend.emails.send(emailOptions);

    if (response.error) {
      // Create FAILED EmailEvent before throwing
      await prisma.emailEvent.create({
        data: {
          to: finalTo,
          subject: subject,
          status: "FAILED",
          providerMessageId: null,
          error: `Resend error: ${response.error.message || "Unknown error"}`,
          supplierId: params.supplierId,
        },
      });
      emailEventCreated = true;
      throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
    }

    if (!response.data?.id) {
      // Create FAILED EmailEvent before throwing
      await prisma.emailEvent.create({
        data: {
          to: finalTo,
          subject: subject,
          status: "FAILED",
          providerMessageId: null,
          error: "Resend returned success but no message ID",
          supplierId: params.supplierId,
        },
      });
      emailEventCreated = true;
      throw new Error("Resend returned success but no message ID");
    }

    // Create SENT EmailEvent on success
    await prisma.emailEvent.create({
      data: {
        to: finalTo,
        subject: subject,
        status: "SENT",
        providerMessageId: response.data.id,
        error: null,
        supplierId: params.supplierId,
      },
    });
    emailEventCreated = true;

    return { id: response.data.id };
  } catch (error) {
    // If error wasn't already handled above, create FAILED EmailEvent
    // (catches network errors, unexpected exceptions, etc.)
    if (!emailEventCreated) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      try {
        await prisma.emailEvent.create({
          data: {
            to: finalTo,
            subject: subject,
            status: "FAILED",
            providerMessageId: null,
            error: errorMessage,
            supplierId: params.supplierId,
          },
        });
      } catch (dbError) {
        // Log but don't fail if EmailEvent creation fails
        console.error("[EMAIL_EVENT_CREATE_FAILED]", {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          originalError: errorMessage,
          supplierId: params.supplierId,
        });
      }
    }
    
    // Rethrow so route-level error handling can log [SUPPLIER_MEMBER_EMAIL_FAILED]
    throw error;
  }
}

export interface SendBuyerNewMessageEmailParams {
  to: string;
  buyerName: string;
  supplierName: string;
  conversationId: string;
  supplierId: string;
  messagePreview: string;
}

/**
 * Send buyer new message email notification
 * Triggered when a supplier sends a message to a buyer
 */
export async function sendBuyerNewMessageEmail(
  params: SendBuyerNewMessageEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  if (isDev && devOverride && params.to !== devOverride) {
    // Validate override email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(devOverride)) {
      console.log("[EMAIL_TO_OVERRIDDEN]", {
        originalTo: params.to,
        overrideTo: devOverride,
        conversationId: params.conversationId,
        supplierId: params.supplierId,
      });
    } else {
      console.warn("[EMAIL_OVERRIDE_INVALID]", {
        devOverride,
        message: "DEV_EMAIL_OVERRIDE is not a valid email, using original recipient",
      });
    }
  }

  // Build email content
  const subject = `New message from ${params.supplierName || "a supplier"} on Agora`;
  
  // HTML escape function for message preview
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const escapedPreview = escapeHtml(params.messagePreview);
  
  let emailBody = `
    <h2>New Message from ${escapeHtml(params.supplierName || "a supplier")}</h2>
    <p><strong>Supplier:</strong> ${escapeHtml(params.supplierName || "a supplier")}</p>
    <p><strong>Buyer:</strong> ${escapeHtml(params.buyerName || "Buyer")}</p>
    <p><strong>Message Preview:</strong></p>
    <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0;">${escapedPreview}</p>
  `;

  // Build URL - link to buyer thread page with supplierId and conversationId
  const baseUrl = getBaseUrl();
  const threadUrl = `${baseUrl}/buyer/suppliers/talk/${encodeURIComponent(params.supplierId)}?conversationId=${encodeURIComponent(params.conversationId)}&from=email`;
  
  // Dev-only logging for email link debugging
  if (process.env.NODE_ENV !== "production") {
    console.log("[EMAIL_LINK]", { baseUrl, threadUrl });
  }
  
  emailBody += `
    <p><a href="${threadUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View Message in Agora</a></p>
  `;

  // OPTIONAL: Add admin BCC if configured
  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  // CRITICAL: Log resolved recipient before sending (always, not just dev)
  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    conversationId: params.conversationId,
    supplierId: params.supplierId,
  });

  const prisma = getPrisma();

  // Send email via Resend and create EmailEvent record
  let emailEventCreated = false;
  try {
    const response = await resend.emails.send(emailOptions);

    if (response.error) {
      // Create FAILED EmailEvent before throwing
      await prisma.emailEvent.create({
        data: {
          to: finalTo,
          subject: subject,
          status: "FAILED",
          providerMessageId: null,
          error: `Resend error: ${response.error.message || "Unknown error"}`,
          supplierId: params.supplierId,
        },
      });
      emailEventCreated = true;
      throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
    }

    if (!response.data?.id) {
      // Create FAILED EmailEvent before throwing
      await prisma.emailEvent.create({
        data: {
          to: finalTo,
          subject: subject,
          status: "FAILED",
          providerMessageId: null,
          error: "Resend returned success but no message ID",
          supplierId: params.supplierId,
        },
      });
      emailEventCreated = true;
      throw new Error("Resend returned success but no message ID");
    }

    // Create SENT EmailEvent on success
    await prisma.emailEvent.create({
      data: {
        to: finalTo,
        subject: subject,
        status: "SENT",
        providerMessageId: response.data.id,
        error: null,
        supplierId: params.supplierId,
      },
    });
    emailEventCreated = true;

    return { id: response.data.id };
  } catch (error) {
    // If error wasn't already handled above, create FAILED EmailEvent
    // (catches network errors, unexpected exceptions, etc.)
    if (!emailEventCreated) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      try {
        await prisma.emailEvent.create({
          data: {
            to: finalTo,
            subject: subject,
            status: "FAILED",
            providerMessageId: null,
            error: errorMessage,
            supplierId: params.supplierId,
          },
        });
      } catch (dbError) {
        // Log but don't fail if EmailEvent creation fails
        console.error("[EMAIL_EVENT_CREATE_FAILED]", {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          originalError: errorMessage,
          supplierId: params.supplierId,
        });
      }
    }
    
    // Rethrow so route-level error handling can log [BUYER_MESSAGE_EMAIL_FAILED]
    throw error;
  }
}

export interface SendSupplierTeamInviteEmailParams {
  to: string;
  supplierName: string;
  inviteToken: string;
}

export async function sendSupplierTeamInviteEmail(
  params: SendSupplierTeamInviteEmailParams
): Promise<{ id: string }> {
  const resend = getResendClientForNotifications();
  const emailFrom = process.env.EMAIL_FROM;

  if (!emailFrom) {
    throw new Error("EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server.");
  }

  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : params.to;

  if (isDev && devOverride && params.to !== devOverride) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(devOverride)) {
      console.log("[EMAIL_TO_OVERRIDDEN]", {
        originalTo: params.to,
        overrideTo: devOverride,
        supplierName: params.supplierName,
      });
    } else {
      console.warn("[EMAIL_OVERRIDE_INVALID]", {
        devOverride,
        message: "DEV_EMAIL_OVERRIDE is not a valid email, using original recipient",
      });
    }
  }

  const subject = `You're invited to join ${params.supplierName} on Agora`;

  const baseUrl = getBaseUrl();
  const inviteUrl = `${baseUrl}/seller/team/invite?token=${encodeURIComponent(params.inviteToken)}`;

  console.log("[TEAM_INVITE_URL]", { inviteUrl, baseUrl });

  const emailBody = `
    <h2>You're Invited to Join ${params.supplierName}</h2>
    <p>You've been invited to join <strong>${params.supplierName}</strong> as a team member on Agora.</p>
    <p>Click the button below to accept the invitation and start collaborating with your team.</p>
    <p style="margin-top: 20px;">
      <a href="${inviteUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
    </p>
    <p style="font-size: 0.8em; color: #666; margin-top: 20px;">
      This invitation will expire in 7 days. If you have questions, contact buildagora@gmail.com.
    </p>
    <p style="font-size: 0.8em; color: #666; margin-top: 10px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      ${inviteUrl}
    </p>
  `;

  const adminBcc = process.env.NOTIFICATIONS_ADMIN_BCC;
  const emailOptions: any = {
    from: emailFrom,
    to: finalTo,
    subject,
    html: emailBody,
  };

  if (adminBcc) {
    emailOptions.bcc = adminBcc;
  }

  console.log("[EMAIL_TO_RESOLVED]", {
    originalTo: params.to,
    finalTo: finalTo,
    hasBcc: !!adminBcc,
    supplierName: params.supplierName,
  });

  const response = await resend.emails.send(emailOptions);

  if (response.error) {
    throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
  }

  if (!response.data?.id) {
    throw new Error("Resend returned success but no message ID");
  }

  return { id: response.data.id };
}
