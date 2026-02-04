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
 */
export async function signAuthToken(payload: { userId: string }): Promise<string> {
  const secret = getJwtSecret();
  return await new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/**
 * Verify an authentication token
 * Returns the payload if valid, null otherwise
 */
export async function verifyAuthToken(token: string): Promise<{ userId: string } | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId === "string") {
      return { userId: payload.userId };
    }
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

