/**
 * Agent Handshake / Idempotency Helpers
 * 
 * Provides deterministic key generation and localStorage-based tracking
 * for preventing duplicate RFQ creation from agent drafts.
 * 
 * Browser-safe: Uses localStorage when available
 * Node-safe: Gracefully no-ops in Node environment
 */

/**
 * Check if we're in a browser environment with localStorage
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Simple stable hash function for long strings
 * Uses djb2 algorithm (non-crypto, fast, deterministic)
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

/**
 * Hash a long string using Node crypto if available, otherwise use simple hash
 */
function hashLongString(str: string): string {
  // Try Node crypto first (more secure, but only in Node)
  if (typeof require !== "undefined") {
    try {
      const crypto = require("crypto");
      return crypto.createHash("sha256").update(str).digest("hex").substring(0, 16);
    } catch {
      // Fall through to simple hash
    }
  }
  
  // Fallback to simple hash (works in both browser and Node)
  return hashString(str);
}

/**
 * Generate a deterministic create key for idempotency
 * 
 * Format: create:${threadId}:${suffix}
 * - suffix is lastProcessedKey (or "none" if null/undefined)
 * - If suffix is >128 chars, it's hashed to keep keys reasonable
 * 
 * @param threadId - The agent thread ID
 * @param lastProcessedKey - Optional last processed key (for idempotency)
 * @returns Deterministic key string
 */
export function generateCreateKey(
  threadId: string,
  lastProcessedKey?: string | null
): string {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("generateCreateKey requires a valid threadId");
  }
  
  // Use "none" if lastProcessedKey is null/undefined
  const suffix = lastProcessedKey ?? "none";
  
  // Hash suffix if it's too long (>128 chars)
  const processedSuffix = suffix.length > 128 ? hashLongString(suffix) : suffix;
  
  return `create:${threadId}:${processedSuffix}`;
}

/**
 * Get the last processed key from localStorage (browser only)
 * In Node, returns null
 * 
 * @returns Last processed key or null
 */
export function getLastProcessedKey(): string | null {
  if (!isBrowser()) {
    return null;
  }
  
  try {
    const stored = window.localStorage.getItem("agent:lastProcessedKey");
    return stored || null;
  } catch {
    // localStorage may be disabled or throw
    return null;
  }
}

/**
 * Set the last processed key in localStorage (browser only)
 * In Node, no-ops
 * 
 * @param key - The key to store
 */
export function setLastProcessedKey(key: string): void {
  if (!isBrowser()) {
    return;
  }
  
  try {
    window.localStorage.setItem("agent:lastProcessedKey", key);
  } catch {
    // localStorage may be disabled or throw - silently fail
  }
}

/**
 * Clear all stored handshake keys from localStorage (browser only)
 * In Node, no-ops
 * 
 * If threadId is provided, clears only that thread's data.
 * If no threadId, clears all agent-related keys.
 */
export function clearCreateHandshake(threadId?: string): void {
  if (!isBrowser()) {
    return;
  }
  
  try {
    if (threadId) {
      // Clear only this thread's data
      window.localStorage.removeItem(`agent:lastCreateKey:${threadId}`);
      window.localStorage.removeItem(`agent:lastCreatedRfqId:${threadId}`);
      window.localStorage.removeItem(`agent:lastProcessedKey:${threadId}`);
    } else {
      // Clear all agent-related keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith("agent:")) {
          keysToRemove.push(key);
        }
      }
      
      for (const key of keysToRemove) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage may be disabled or throw - silently fail
  }
}

/**
 * Thread-scoped helpers for compatibility with test script
 * These use threadId as part of the localStorage key
 */

/**
 * Get the last create key for a specific thread
 */
export function getLastCreateKey(threadId: string): string | null {
  if (!isBrowser()) {
    return null;
  }
  
  try {
    const stored = window.localStorage.getItem(`agent:lastCreateKey:${threadId}`);
    return stored || null;
  } catch {
    return null;
  }
}

/**
 * Set the last create key for a specific thread
 */
export function setLastCreateKey(threadId: string, key: string): void {
  if (!isBrowser()) {
    return;
  }
  
  try {
    window.localStorage.setItem(`agent:lastCreateKey:${threadId}`, key);
  } catch {
    // Silently fail
  }
}

/**
 * Get the last created RFQ ID for a specific thread
 */
export function getLastCreatedRfqId(threadId: string): string | null {
  if (!isBrowser()) {
    return null;
  }
  
  try {
    const stored = window.localStorage.getItem(`agent:lastCreatedRfqId:${threadId}`);
    return stored || null;
  } catch {
    return null;
  }
}

/**
 * Set the last created RFQ ID for a specific thread
 */
export function setLastCreatedRfqId(threadId: string, rfqId: string): void {
  if (!isBrowser()) {
    return;
  }
  
  try {
    window.localStorage.setItem(`agent:lastCreatedRfqId:${threadId}`, rfqId);
  } catch {
    // Silently fail
  }
}

