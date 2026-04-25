/**
 * Anonymous chat identity via cookie.
 *
 * Threads created before sign-in are owned by a random ID stored in a long-lived
 * cookie. After sign-in, those threads can be claimed (transferred to userId) —
 * see `claimAnonymousThreads()` in threads.server.ts.
 *
 * The cookie is unsigned: the worst an attacker can do by forging another user's
 * ID is read pre-login chat history. Anonymous IDs are random UUIDs and not
 * discoverable. Add HMAC signing if abuse becomes a concern.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { ANON_COOKIE_NAME } from "./types";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export function readAnonymousId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ANON_COOKIE_NAME && rest.length > 0) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Resolve (or generate) the visitor's anonymous ID. Caller is responsible for
 * attaching the Set-Cookie header to the response when `setCookie` is true.
 */
export function resolveAnonymousId(request: Request): {
  anonymousId: string;
  setCookie: boolean;
} {
  const existing = readAnonymousId(request);
  if (existing) return { anonymousId: existing, setCookie: false };
  return { anonymousId: randomUUID(), setCookie: true };
}

export function setAnonymousIdCookie(
  response: NextResponse,
  anonymousId: string
): void {
  response.cookies.set({
    name: ANON_COOKIE_NAME,
    value: anonymousId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

/**
 * Format the cookie as a raw Set-Cookie header value, for use with the bare
 * `Response` constructor (e.g. when returning an SSE stream).
 */
export function formatAnonymousIdCookie(anonymousId: string): string {
  const parts = [
    `${ANON_COOKIE_NAME}=${encodeURIComponent(anonymousId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${THIRTY_DAYS_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
