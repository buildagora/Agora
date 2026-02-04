import "server-only";
import { resend } from "./server/resend";

/**
 * Server-only email utilities
 * This module can only be imported in server-side code
 */

export interface EmailConfig {
  hasKey: boolean;
  keyPrefix: string | null;
  from: string | null;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Get email configuration status
 */
export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  return {
    hasKey: !!(apiKey && apiKey.startsWith("re_")),
    keyPrefix: apiKey && apiKey.startsWith("re_") ? apiKey.slice(0, 4) : null,
    from: emailFrom || null,
  };
}

/**
 * Send an email using Resend
 * @throws Error if configuration is missing or send fails
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  // DEV-ONLY: Warn if email config is missing (non-blocking in dev)
  if (process.env.NODE_ENV === "development") {
    if (!apiKey || !apiKey.startsWith("re_")) {
      console.warn("⚠️ EMAIL_CONFIG_MISSING", {
        message: "RESEND_API_KEY is not set or invalid. Email notifications will fail.",
        action: "Add RESEND_API_KEY=re_... to .env.local and restart the dev server.",
      });
    }
    if (!emailFrom) {
      console.warn("⚠️ EMAIL_CONFIG_MISSING", {
        message: "EMAIL_FROM is not set. Email notifications will fail.",
        action: "Add EMAIL_FROM=... to .env.local and restart the dev server.",
      });
    }
  }

  if (!apiKey || !apiKey.startsWith("re_")) {
    throw new Error(
      "RESEND_API_KEY is not set or invalid. Please add RESEND_API_KEY=re_... to your .env.local file and restart the dev server."
    );
  }

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // DEV_EMAIL_OVERRIDE: In development, redirect all emails to override address
  const devOverride = process.env.DEV_EMAIL_OVERRIDE;
  const isDev = process.env.NODE_ENV === "development";
  const finalTo = isDev && devOverride ? devOverride : options.to;

  if (isDev && devOverride && options.to !== devOverride) {
    console.log("[DEV_EMAIL_OVERRIDE]", {
      originalTo: options.to,
      overrideTo: devOverride,
      subject: options.subject,
    });
  }

  try {
    const response = await resend.emails.send({
      from: emailFrom,
      to: finalTo,
      subject: options.subject,
      html: options.html,
      ...(options.text && { text: options.text }),
    });

    if (response.error) {
      throw new Error(`Resend error: ${response.error.message || "Unknown error"}`);
    }

    if (!response.data?.id) {
      throw new Error("Resend returned success but no message ID");
    }

    return { id: response.data.id };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to send email: ${String(error)}`);
  }
}



