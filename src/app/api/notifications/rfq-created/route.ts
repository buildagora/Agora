/**
 * Server-side only RFQ email notification endpoint
 * This route is ONLY called from server-side code (RFQ creation endpoint)
 * It is NOT accessible from client-side code
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email.server";
import { getPrisma } from "@/lib/db.server";

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
}

/**
 * Server-side only endpoint for RFQ email notifications
 * Called internally by RFQ creation endpoint
 * Idempotent: uses EmailEvent table to prevent duplicates
 */
export async function POST(request: NextRequest) {
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

    // IDEMPOTENCY CHECK: Use header if provided, otherwise construct from rfq+supplier
    const idempotencyKeyHeader = request.headers.get("Idempotency-Key");
    const idempotencyKey = idempotencyKeyHeader || `rfq:${body.rfq.id}:supplier:${body.supplier.id}`;
    
    // Check EmailEvent table to prevent duplicate emails
    const existingEvent = await prisma.emailEvent.findFirst({
      where: {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id,
        status: { in: ["SENT", "OUTBOX"] }, // Only check successful/outbox events
      },
    });

    if (existingEvent) {
      // Idempotent success: email already sent
      console.log("[RFQ_EMAIL_IDEMPOTENT_SKIP]", {
        rfqId: body.rfq.id,
        supplierId: body.supplier.id,
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

    // Build URL - link to specific RFQ detail page (deterministic deep link)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const rfqUrl = `${baseUrl}/seller/rfqs/${body.rfq.id}`;
    
    emailBody += `
      <p><a href="${rfqUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px;">View RFQ</a></p>
    `;

    // Send email using server-only module (same pattern as Award/PO emails)
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
            to: body.supplier.email,
            subject,
            status: "OUTBOX",
            rfqId: body.rfq.id,
            supplierId: body.supplier.id,
          },
        });

        console.log("[RFQ_EMAIL_SENT]", {
          rfqId: body.rfq.id,
          supplierId: body.supplier.id,
          supplierEmail: body.supplier.email,
          status: "OUTBOX",
        });

        return NextResponse.json({
          ok: true,
          providerId: emailEventId,
          outbox: true,
        });
      }

      // Production or dev with email config: send actual email
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
