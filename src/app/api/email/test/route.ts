import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email.server";

export const runtime = "nodejs";

/**
 * Test email endpoint
 * GET /api/email/test?to=email@example.com
 * Sends a simple test email to verify delivery
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get("to");

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Missing 'to' query parameter" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { ok: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Send test email
    const result = await sendEmail({
      to,
      subject: "Agora Email Test",
      html: `
        <h2>Test Email</h2>
        <p>This is a test email from Agora.</p>
        <p>If you received this, your email configuration is working correctly!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
      text: `Test Email\n\nThis is a test email from Agora.\n\nIf you received this, your email configuration is working correctly!\n\nTimestamp: ${new Date().toISOString()}`,
    });

    return NextResponse.json({
      ok: true,
      messageId: result.id,
      to,
    });
  } catch (error: any) {
    console.error("❌ EMAIL_TEST_ERROR", {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to send test email",
      },
      { status: 500 }
    );
  }
}
