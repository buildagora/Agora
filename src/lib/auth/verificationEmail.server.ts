import "server-only";
import { sendEmail } from "@/lib/email.server";
import { getBaseUrl } from "@/lib/urls/baseUrl.server";

export interface SendVerificationEmailParams {
  to: string;
  token: string;
  userEmail: string;
}

/**
 * Send email verification email
 * @throws Error if email sending fails
 */
export async function sendVerificationEmail(
  params: SendVerificationEmailParams
): Promise<{ id: string }> {
  const baseUrl = getBaseUrl();
  const verifyUrl = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(params.token)}`;

  const subject = "Verify your Agora email";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px;">
          <h1 style="color: #111827; font-size: 24px; font-weight: 600; margin: 0 0 16px 0;">
            Verify your email address
          </h1>
          <p style="color: #4b5563; font-size: 16px; margin: 0 0 24px 0;">
            Thanks for signing up for Agora! Please verify your email address by clicking the button below.
          </p>
          <div style="margin: 32px 0;">
            <a href="${verifyUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0; word-break: break-all;">
            ${verifyUrl}
          </p>
          <p style="color: #6b7280; font-size: 14px; margin: 32px 0 0 0; border-top: 1px solid #e5e7eb; padding-top: 24px;">
            This verification link will expire in 24 hours. If you didn't create an Agora account, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
Verify your email address

Thanks for signing up for Agora! Please verify your email address by visiting the link below:

${verifyUrl}

This verification link will expire in 24 hours. If you didn't create an Agora account, you can safely ignore this email.
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
  });
}



