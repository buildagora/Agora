/**
 * JWT Authentication Helpers
 * Signs and verifies authentication tokens
 * Server-only module
 */

import "server-only";
import { SignJWT, jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("AUTH_SECRET is missing. Set AUTH_SECRET in .env.local.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign an authentication token for a user
 * activeRole is REQUIRED and must be either "BUYER" or "SELLER"
 */
export async function signAuthToken(payload: { userId: string; activeRole: "BUYER" | "SELLER" }): Promise<string> {
  const secret = getJwtSecret();
  return await new SignJWT({ userId: payload.userId, activeRole: payload.activeRole })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/**
 * Verify an authentication token
 * Returns the payload with userId and activeRole if valid, null otherwise
 */
export async function verifyAuthToken(token: string): Promise<{ userId: string; activeRole: "BUYER" | "SELLER" } | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.userId === "string" &&
      (payload.activeRole === "BUYER" || payload.activeRole === "SELLER")
    ) {
      return { userId: payload.userId, activeRole: payload.activeRole };
    }
    // Legacy token without activeRole - invalid
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the auth cookie name
 */
export function getAuthCookieName(): string {
  return "agora.auth";
}

