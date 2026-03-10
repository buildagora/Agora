/**
 * Client-only auth helpers
 * 
 * NEW FOUNDATION: Server (cookie + JWT + DB) is the single source of truth.
 * NO storage, NO event bus, NO caching.
 * Use AuthProvider + useAuth hook for React components.
 */

"use client";

import type { User } from "./types";
import { fetchJson } from "../clientFetch";

// Safeguard to prevent duplicate concurrent calls to /api/auth/me
let inFlight: Promise<User | null> | null = null;

/**
 * Get the current authenticated user
 * 
 * NEW FOUNDATION: Server is the ONLY source of truth.
 * Always calls /api/auth/me to verify cookie and get user from database.
 * NO caching, NO storage, NO event bus.
 * 
 * For React components, use useAuth() hook from AuthProvider instead.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // If there's already a fetch in progress, wait for it
  if (inFlight) {
    return await inFlight;
  }

  // ALWAYS verify with server - no cache, no storage, no fallback
  inFlight = (async () => {
    try {
      const result = await fetchJson("/api/auth/me", {
        method: "GET",
        credentials: "include", // CRITICAL: Include cookie
      });

      if (result.ok && result.json?.ok && result.json?.user) {
        return result.json.user as User;
      } else {
        return null;
      }
    } catch (error) {
      // Network error - do NOT fall back to anything
      // Server is source of truth, so if we can't reach it, we're not authenticated
      return null;
    } finally {
      // Clear in-flight flag
      inFlight = null;
    }
  })();

  return await inFlight;
}

/**
 * Sign out the current user
 * CRITICAL: Clears cookie and redirects to landing page.
 * Navigation should be handled by the caller using router.replace() to avoid server redirects.
 * 
 * @returns Always returns "/" (landing page)
 */
export async function signOut(): Promise<string> {
  // CANONICAL ENDPOINT: POST /api/auth/logout (clear cookie across all paths: /, /buyer, /seller)
  await fetch("/api/auth/logout", { 
    method: "POST", 
    credentials: "include",
    cache: "no-store",
  }).catch(() => {
    // Silently fail
  });
  
  // CRITICAL: Reset AuthProvider state immediately
  if (typeof window !== "undefined") {
    // Dispatch a custom event to notify AuthProvider to reset
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }
  
  // Always redirect to landing page after sign out
  return "/";
}
