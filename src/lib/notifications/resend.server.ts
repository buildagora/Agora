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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const feedUrl = params.rfq.urlPath 
    ? `${baseUrl}${params.rfq.urlPath}`
    : `${baseUrl}/seller/feed?category=${encodeURIComponent(params.rfq.category)}`;
  
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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
 */
export async function sendPoGeneratedEmail(
  params: SendPoGeneratedEmailParams
): Promise<{ id: string }> {
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
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
