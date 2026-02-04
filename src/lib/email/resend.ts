import { Resend } from "resend";

let resendClient: Resend | null = null;

/**
 * Get or create Resend client instance
 * Validates that RESEND_API_KEY and EMAIL_FROM are configured
 * 
 * @returns Resend client instance
 * @throws Error if configuration is missing
 */
export function getResendClient(): Resend {
  // Return cached client if already created
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  // Validate configuration
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Please add RESEND_API_KEY to your .env.local file and restart the dev server."
    );
  }

  if (!emailFrom) {
    throw new Error(
      "EMAIL_FROM is not set. Please add EMAIL_FROM to your .env.local file and restart the dev server."
    );
  }

  // Validate email format (supports both "email@domain.com" and "Name <email@domain.com>")
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailMatch = emailFrom.match(/<([^>]+)>/) || [null, emailFrom];
  const actualEmail = emailMatch[1] || emailFrom;
  
  if (!emailRegex.test(actualEmail.trim())) {
    throw new Error(
      `EMAIL_FROM is not a valid email address: ${emailFrom}. Please set a valid email address in .env.local.`
    );
  }

  // SERVER-SIDE debug logs right before creating Resend client
  console.log("📧 RESEND_CLIENT_DEBUG", {
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : "MISSING",
    apiKeyLength: apiKey?.length || 0,
    emailFrom: emailFrom,
    nodeEnv: process.env.NODE_ENV,
    apiKeyStartsWithRe: apiKey?.startsWith("re_") || false,
  });

  // Create and cache client
  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Check if email is configured (without throwing)
 * Useful for conditional UI rendering
 * 
 * @returns true if both RESEND_API_KEY and EMAIL_FROM are set
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/**
 * Get email configuration status for debugging
 * 
 * @returns Object with configuration status
 */
export function getEmailConfigStatus() {
  return {
    hasApiKey: !!process.env.RESEND_API_KEY,
    hasEmailFrom: !!process.env.EMAIL_FROM,
    emailFrom: process.env.EMAIL_FROM || null,
    isConfigured: isEmailConfigured(),
  };
}

