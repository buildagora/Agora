/**
 * Server-side only RFQ email notification endpoint
 * This route is ONLY called from server-side code (RFQ creation endpoint)
 * It is NOT accessible from client-side code
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail, getEmailConfig } from "@/lib/email.server";
import { getPrisma } from "@/lib/db.server";
import { getBaseUrl } from "@/lib/urls/baseUrl.server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotificationPayload {
  rfq: {
    id: string;
    buyerName: string;
    category: string;
    title: string;
    description?: string;
    createdAt: string;
    dueAt?: string;
    location?: string;
    urlPath?: string;
  };
  supplier: {
    id: string;
    email: string;
    name?: string;
  };
  invite?: {
    token?: string | null;
    expiresAt?: string;
  };
  preview?: {
    lineItemCount?: number;
  };
}

/**
 * Server-side only endpoint for RFQ email notifications
 * Called internally by RFQ creation endpoint
 * Idempotent: uses EmailEvent table to prevent duplicates
 */
export async function POST(request: NextRequest) {
  // Check if emails are enabled
  const emailsEnabled = process.env.SUPPLIER_EMAILS_ENABLED === "1";

  if (!emailsEnabled) {
    console.log("[RFQ_EMAIL_SKIPPED]", {
      reason: "SUPPLIER_EMAILS_DISABLED",
      nodeEnv: process.env.NODE_ENV,
      enabledFlag: process.env.SUPPLIER_EMAILS_ENABLED,
    });

    return NextResponse.json({ ok: true, skipped: true, reason: "SUPPLIER_EMAILS_DISABLED" });
  }

  try {
    // Parse request body
    let body: NotificationPayload;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.rfq || !body.supplier) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: rfq, supplier" },
        { status: 400 }
      );
    }

    if (!body.rfq.id || !body.rfq.buyerName || !body.rfq.category || !body.rfq.title) {
      return NextResponse.json(
        { ok: false, error: "Missing required RFQ fields: id, buyerName, category, title" },
        { status: 400 }
      );
    }

    if (!body.supplier.id || !body.supplier.email) {
      return NextResponse.json(
        { ok: false, error: "Missing required supplier fields: id, email" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.supplier.email)) {
      return NextResponse.json(
        { ok: false, error: "Invalid supplier email address" },
        { status: 400 }
      );
    }

    const prisma = getPrisma();

    // IDEMPOTENCY CHECK: Check EmailEvent table to prevent duplicate emails
    // CRITICAL: Include recipient email (to) because multiple recipients share the same supplierId (org-scoped)
    const existingEvent = await prisma.emailEvent.findFirst({
      where: {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id, // Supplier org id
        to: body.supplier.email, // Recipient email (member's email)
        status: { in: ["SENT", "OUTBOX"] }, // Check both successful and outbox events
      },
    });

    if (existingEvent) {
      // Idempotent success: email already sent
      console.log("[RFQ_EMAIL_IDEMPOTENT_SKIP]", {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id, // Supplier org id
        recipientEmail: body.supplier.email, // Recipient email (member's email)
        reason: "Email already sent (idempotent)",
      });
      return NextResponse.json({
        ok: true,
        message: "Already processed (idempotent)",
        providerId: existingEvent.providerMessageId || existingEvent.id,
      });
    }

    // Build email content
    const subject = `New RFQ: ${body.rfq.title}`;
    
    let emailBody = `
      <h2>New RFQ Available</h2>
      <p><strong>Category:</strong> ${body.rfq.category}</p>
      <p><strong>Title:</strong> ${body.rfq.title}</p>
      <p><strong>Buyer:</strong> ${body.rfq.buyerName}</p>
    `;

    if (body.rfq.description) {
      emailBody += `<p><strong>Description:</strong> ${body.rfq.description}</p>`;
    }

    if (body.rfq.dueAt) {
      const dueDate = new Date(body.rfq.dueAt);
      emailBody += `<p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>`;
    }

    if (body.rfq.location) {
      emailBody += `<p><strong>Location:</strong> ${body.rfq.location}</p>`;
    }

    // Preview "bait" (Option B)
    if (body.preview?.lineItemCount) {
      emailBody += `<p><strong>Items:</strong> ${body.preview.lineItemCount} line item(s)</p>`;
    }

    // Determine call-to-action URL
    // - If invite token exists: supplier can redeem invite to access RFQ (even without account)
    // - Else: deep-link to feed using urlPath from RFQ or fallback to feed
    const baseUrl = getBaseUrl();
    const hasInviteToken = !!(body.invite && body.invite.token);
    const inviteToken = body.invite?.token ? String(body.invite.token) : null;

    // Helper to safely resolve absolute URLs
    // Prevents malformed URLs like baseUrl + "http://..." by detecting absolute URLs early
    function resolveAbsoluteUrl(baseUrl: string, urlPath: string | undefined | null, fallbackPath: string): string {
      const raw = (urlPath || "").trim();

      // If already absolute (starts with http:// or https://), return as-is
      // This prevents accidentally generating baseUrl + "http://..." malformed URLs
      if (/^https?:\/\//i.test(raw)) return raw;

      // If empty, use fallback
      const path = raw ? raw : fallbackPath;

      // Ensure leading slash for relative paths
      const normalized = path.startsWith("/") ? path : `/${path}`;

      // Combine baseUrl with normalized path
      return `${baseUrl}${normalized}`;
    }

    let rfqUrl: string;
    let buttonText: string;

    if (hasInviteToken) {
      // Invite token path: for non-account suppliers
      rfqUrl = `${baseUrl}/seller/rfqs/invite?token=${encodeURIComponent(inviteToken!)}&rfqId=${encodeURIComponent(body.rfq.id)}&supplierId=${encodeURIComponent(body.supplier.id)}`;
      buttonText = "Create account & quote";
      emailBody += `<p><em>Create an account to view full details and submit your quote.</em></p>`;
    } else {
      // Deep-link to feed: use urlPath from RFQ or fallback to feed
      rfqUrl = resolveAbsoluteUrl(baseUrl, body.rfq.urlPath, "/seller/feed?from=email");
      buttonText = "View in Agora";
    }

    // Log resolved URL for debugging
    console.log("[RFQ_EMAIL_LINK]", {
      rfqId: body.rfq.id,
      to: body.supplier.email,
      urlPath: body.rfq.urlPath || null,
      resolvedUrl: rfqUrl,
    });
    
    emailBody += `
      <p><a href="${rfqUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">${buttonText}</a></p>
    `;

    // Send email using server-only module (same pattern as Award/PO emails)
    let emailEventId = crypto.randomUUID();

    // Validate email configuration before attempting to send
    const emailConfig = getEmailConfig();
    const hasEmailConfig = emailConfig.hasKey && emailConfig.from;

    if (!hasEmailConfig) {
      const errorMessage = !emailConfig.hasKey
        ? "RESEND_API_KEY is not set or invalid"
        : "EMAIL_FROM is not set";
      
      // Write FAILED EmailEvent for missing config
      await prisma.emailEvent.create({
        data: {
          id: emailEventId,
          to: body.supplier.email,
          subject,
          status: "FAILED",
          error: errorMessage,
          rfqId: body.rfq.id,
          supplierId: body.supplier.id,
        },
      });

      console.error("[RFQ_EMAIL_CONFIG_MISSING]", {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id,
        error: errorMessage,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Email configuration is missing or invalid",
          details: errorMessage,
        },
        { status: 500 }
      );
    }

    try {
      // Always send actual email when config is valid
      const result = await sendEmail({
        to: body.supplier.email,
        subject,
        html: emailBody,
      });

      // Write EmailEvent to database (authoritative record)
      await prisma.emailEvent.create({
        data: {
          id: emailEventId,
          to: body.supplier.email,
          subject,
          status: "SENT",
          providerMessageId: result.id,
          rfqId: body.rfq.id,
          supplierId: body.supplier.id,
        },
      });

      console.log("[RFQ_EMAIL_SENT]", {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id,
        supplierEmail: body.supplier.email,
        providerMessageId: result.id,
      });

      return NextResponse.json({
        ok: true,
        providerId: result.id,
      });
    } catch (error: any) {
      const errorDetails = error.message || "Unknown error";

      // Write EmailEvent to database (authoritative record for failures)
      await prisma.emailEvent.create({
        data: {
          id: emailEventId,
          to: body.supplier.email,
          subject,
          status: "FAILED",
          error: errorDetails,
          rfqId: body.rfq.id,
          supplierId: body.supplier.id,
        },
      });

      console.error("[RFQ_EMAIL_FAILED]", {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id,
        error: errorDetails,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Resend error",
          details: errorDetails,
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error("❌ NOTIFICATION_ROUTE_ERROR", {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
