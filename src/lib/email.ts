/**
 * Email notification helper (stubbed for MVP)
 * In production, this would integrate with an email service (SendGrid, AWS SES, etc.)
 */

interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  attachments?: Array<{
    filename: string;
    content: Uint8Array | string; // Uint8Array for binary, string for base64
    type: string; // MIME type
    encoding?: string; // 'base64' if content is base64 string
  }>;
}

/**
 * Send an email notification
 * Currently stubbed - logs to console and would send via email service in production
 */
export function sendEmail(options: EmailOptions): void {
  // Build email body with CTA link if provided
  let emailBody = options.body;
  let fullUrl = "";
  if (options.ctaLabel && options.ctaHref) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    fullUrl = `${baseUrl}${options.ctaHref}`;
    emailBody += `\n\n${options.ctaLabel}: ${fullUrl}`;
  }

  // Convert attachments to base64 for logging (in production, email service would handle this)
  const attachmentsForLog = options.attachments?.map((att) => ({
    filename: att.filename,
    type: att.type,
    size: att.content instanceof Uint8Array ? att.content.length : att.content.length,
    encoding: att.encoding || "binary",
  }));

  // Log email payload with structured format
  const emailPayload = {
    to: options.to,
    subject: options.subject,
    body: emailBody,
    ctaLabel: options.ctaLabel,
    ctaHref: options.ctaHref,
    fullUrl: fullUrl || undefined,
    attachments: attachmentsForLog,
    timestamp: new Date().toISOString(),
  };

  console.log("📧 EMAIL_SEND", emailPayload);

  // In production, this would call an email service API
  // Example with PDF attachment:
  // try {
  //   const attachments = options.attachments?.map((att) => {
  //     if (att.content instanceof Uint8Array) {
  //       // Convert Uint8Array to base64 for email service
  //       const base64 = Buffer.from(att.content).toString('base64');
  //       return {
  //         filename: att.filename,
  //         content: base64,
  //         type: att.type,
  //         encoding: 'base64',
  //       };
  //     }
  //     return att;
  //   });
  //
  //   const response = await emailService.send({
  //     to: options.to,
  //     subject: options.subject,
  //     html: generateEmailTemplate(options.body, options.ctaLabel, options.ctaHref),
  //     attachments: attachments,
  //   });
  //   console.log("✅ EMAIL_SENT", { to: options.to, messageId: response.messageId });
  // } catch (error) {
  //   console.error("❌ EMAIL_ERROR", { to: options.to, error: error.message });
  // }
}

