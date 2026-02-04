import { NextRequest, NextResponse } from "next/server";

interface EmailPORequest {
  to: string;
  subject: string;
  body: string;
  attachment: {
    filename: string;
    content: string; // base64 encoded PDF
    type: string;
  };
}

/**
 * API route to send Purchase Order email with PDF attachment
 * In production, this would use a real email service (Resend, SendGrid, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body: EmailPORequest = await request.json();

    // Validate request
    if (!body.to || !body.subject || !body.attachment) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: to, subject, attachment" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.to)) {
      return NextResponse.json(
        { ok: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Validate attachment
    if (!body.attachment.content || body.attachment.content.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Attachment content is empty" },
        { status: 400 }
      );
    }

    // Check if email service is configured
    const emailProvider = process.env.EMAIL_PROVIDER; // 'resend', 'sendgrid', 'smtp', etc.
    const emailApiKey = process.env.EMAIL_API_KEY;

    // Log email attempt
    const attachmentSizeBytes = Buffer.from(body.attachment.content, "base64").length;
    console.log("📧 EMAIL_PO_REQUEST", {
      to: body.to,
      subject: body.subject,
      attachmentFilename: body.attachment.filename,
      attachmentSizeBytes,
      hasProvider: !!emailProvider,
      hasApiKey: !!emailApiKey,
      timestamp: new Date().toISOString(),
    });

    // In development or if no provider configured, return dev mode response
    if (process.env.NODE_ENV === "development" && !emailProvider) {
      console.log("📧 EMAIL_PO_DEV_MODE", {
        message: "Email service not configured - running in dev mode",
        to: body.to,
        subject: body.subject,
        attachmentSizeBytes,
      });

      return NextResponse.json({
        ok: false,
        error: "EMAIL_DISABLED_DEV_MODE",
        message: "Email service not configured. In production, this would send via email provider.",
        devInfo: {
          to: body.to,
          subject: body.subject,
          attachmentFilename: body.attachment.filename,
          attachmentSizeBytes,
        },
      });
    }

    // If provider is configured but API key is missing
    if (emailProvider && !emailApiKey) {
      console.error("❌ EMAIL_PO_ERROR", {
        error: "EMAIL_API_KEY_MISSING",
        provider: emailProvider,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "EMAIL_API_KEY_MISSING",
          message: `Email provider ${emailProvider} is configured but API key is missing`,
        },
        { status: 500 }
      );
    }

    // In production, send via email provider
    // Example implementation for Resend (uncomment and configure):
    /*
    if (emailProvider === "resend") {
      const { Resend } = require("resend");
      const resend = new Resend(emailApiKey);

      const response = await resend.emails.send({
        from: emailFrom,
        to: body.to,
        subject: body.subject,
        html: `<p>${body.body}</p>`,
        attachments: [
          {
            filename: body.attachment.filename,
            content: body.attachment.content,
          },
        ],
      });

      if (response.error) {
        console.error("❌ EMAIL_PO_ERROR", {
          to: body.to,
          error: response.error.message,
          provider: "resend",
        });

        return NextResponse.json(
          {
            ok: false,
            error: response.error.message || "EMAIL_SEND_FAILED",
            details: response.error,
          },
          { status: 500 }
        );
      }

      console.log("✅ EMAIL_PO_SENT", {
        to: body.to,
        messageId: response.data?.id,
        provider: "resend",
      });

      return NextResponse.json({
        ok: true,
        messageId: response.data?.id,
        to: body.to,
      });
    }
    */

    // If we reach here, provider is configured but not implemented
    console.error("❌ EMAIL_PO_ERROR", {
      error: "EMAIL_PROVIDER_NOT_IMPLEMENTED",
      provider: emailProvider,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "EMAIL_PROVIDER_NOT_IMPLEMENTED",
        message: `Email provider ${emailProvider} is configured but not implemented`,
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("❌ EMAIL_PO_ERROR", {
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

