import { NextRequest, NextResponse } from "next/server";
import { generatePurchaseOrderPdfBytes, type PO } from "@/lib/poPdf";
import { getResendClient } from "@/lib/server/resend";

export const runtime = "nodejs";

interface EmailPORequest {
  userId: string;
  po: PO;
}

/**
 * API route to email Purchase Order PDF to the authenticated user
 * POST /api/purchase-orders/[id]/email
 * 
 * Body: { userId: string, po: PO }
 * 
 * Returns: { ok: boolean, messageId?: string, error?: string, to?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body: EmailPORequest = await request.json();
    const { id: poId } = await params;

    // Validate request
    if (!body.userId || !body.po) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: userId, po" },
        { status: 400 }
      );
    }

    // Validate PO ID matches
    if (body.po.id !== poId) {
      return NextResponse.json(
        { ok: false, error: "PO ID mismatch" },
        { status: 400 }
      );
    }

    // Basic user validation (in a real app, you'd verify against a session/token)
    // For now, we'll trust the client but log it
    const userId = body.userId;
    
    // Log env var presence (SERVER-side only)
    console.log("📧 EMAIL_PO_ENV_CHECK", {
      hasResendApiKey: !!process.env.RESEND_API_KEY,
      hasEmailFrom: !!process.env.EMAIL_FROM,
    });
    
    console.log("📧 EMAIL_PO_REQUEST", {
      userId,
      poId,
      poNumber: body.po.poNumber,
      timestamp: new Date().toISOString(),
    });

    // Get Resend client (validates configuration)
    let resend: ReturnType<typeof getResendClient>;
    try {
      resend = getResendClient();
    } catch (error: any) {
      console.log("📧 EMAIL_PO_CONFIG_MISSING", {
        error: error.message,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "EMAIL_NOT_CONFIGURED",
          message: "Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM in .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    // Generate PDF bytes (same as download)
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = generatePurchaseOrderPdfBytes(body.po);
    } catch (error: any) {
      console.error("❌ EMAIL_PO_PDF_GENERATION_ERROR", {
        error: error.message,
        poId,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "PDF_GENERATION_FAILED",
          message: error.message || "Failed to generate PDF",
        },
        { status: 500 }
      );
    }

    // Validate PDF was generated
    if (!pdfBytes || pdfBytes.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "PDF_GENERATION_FAILED",
          message: "Generated PDF is empty",
        },
        { status: 500 }
      );
    }

    // Convert Uint8Array to base64 for Resend attachment
    // Convert Uint8Array to Buffer, then to base64
    const pdfBuffer = Buffer.from(pdfBytes);
    const base64Pdf = pdfBuffer.toString("base64");

    // Get user email from request body (required)
    const recipientEmail = (body as any).userEmail;
    if (!recipientEmail || !recipientEmail.includes("@")) {
      return NextResponse.json(
        {
          ok: false,
          error: "USER_EMAIL_MISSING",
          message: "User email is required to send the purchase order",
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return NextResponse.json(
        { ok: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Send email via Resend
    try {
      const emailFrom = process.env.EMAIL_FROM!; // Already validated by getResendClient()

      // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
      const devOverride = process.env.DEV_EMAIL_OVERRIDE;
      const isDev = process.env.NODE_ENV === "development";
      const finalTo = isDev && devOverride ? devOverride : recipientEmail;

      if (isDev && devOverride && recipientEmail !== devOverride) {
        console.log("[DEV_EMAIL_OVERRIDE]", {
          originalTo: recipientEmail,
          overrideTo: devOverride,
          poId,
        });
      }

      const response = await resend.emails.send({
        from: emailFrom,
        to: finalTo,
        subject: `Purchase Order ${body.po.poNumber}`,
        html: `
          <p>Hello,</p>
          <p>Please find attached your Purchase Order <strong>${body.po.poNumber}</strong>.</p>
          <p>Total: <strong>$${body.po.total.toFixed(2)}</strong></p>
          <p>Thank you for your business.</p>
        `,
        attachments: [
          {
            filename: `PO-${body.po.poNumber}.pdf`,
            content: base64Pdf,
          },
        ],
      });

      if (response.error) {
        // Log full Resend error response (SERVER-side only)
        console.error("❌ EMAIL_PO_RESEND_ERROR", {
          to: recipientEmail,
          error: response.error.message,
          errorName: response.error.name,
          errorStatus: (response.error as any).status,
          errorBody: JSON.stringify(response.error, null, 2),
          poId,
        });

        return NextResponse.json(
          {
            ok: false,
            error: response.error.message || "EMAIL_SEND_FAILED",
            message: response.error.message || "Failed to send email",
          },
          { status: 500 }
        );
      }

      console.log("✅ EMAIL_PO_SENT", {
        to: recipientEmail,
        messageId: response.data?.id,
        poId,
        poNumber: body.po.poNumber,
      });

      return NextResponse.json({
        ok: true,
        messageId: response.data?.id,
        to: recipientEmail,
      });
    } catch (error: any) {
      console.error("❌ EMAIL_PO_ERROR", {
        error: error.message,
        stack: error.stack,
        poId,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "INTERNAL_ERROR",
          message: error.message || "An unexpected error occurred while sending email",
        },
        { status: 500 }
      );
    }
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

