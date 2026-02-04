import { Resend } from "resend";

/**
 * Server-side Resend client instance
 * 
 * This module is safe to import from:
 * - Next.js API route handlers
 * - Node.js scripts (via tsx)
 * 
 * It must NOT be imported from client components (enforced by usage patterns).
 */

const apiKey = process.env.RESEND_API_KEY;

// Validate API key exists and has correct format
if (!apiKey) {
  throw new Error(
    "RESEND_API_KEY is not set. Please add RESEND_API_KEY=re_... to your .env.local file and restart the dev server."
  );
}

if (!apiKey.startsWith("re_")) {
  throw new Error(
    `RESEND_API_KEY must start with "re_". Current value starts with "${apiKey.slice(0, 3)}". Please check your .env.local file and restart the dev server.`
  );
}

// Create and export the Resend instance
export const resend = new Resend(apiKey);

/**
 * Get the Resend client instance
 * This is a convenience function for consistency with other server modules
 */
export function getResendClient() {
  return resend;
}

