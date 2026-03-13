import "server-only";
import { randomBytes } from "crypto";
import { createHash } from "crypto";

/**
 * Generate a secure random token for email verification
 * @returns Raw token (to be sent in email) and hashed token (to be stored in DB)
 */
export function generateVerificationToken(): {
  rawToken: string;
  tokenHash: string;
} {
  // Generate 32 bytes of random data (256 bits)
  const rawToken = randomBytes(32).toString("hex");
  
  // Hash the token using SHA-256 (same approach as SupplierInvite)
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  
  return { rawToken, tokenHash };
}

/**
 * Hash a verification token for comparison
 */
export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Get expiration time for verification token (24 hours from now)
 */
export function getVerificationTokenExpiration(): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt;
}

