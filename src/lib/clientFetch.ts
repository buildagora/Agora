/**
 * Client-side fetch helper
 * Ensures credentials are included and handles responses consistently
 */

export interface FetchJsonResult {
  ok: boolean;
  status: number;
  json: any | null;
  text: string;
}

/**
 * Fetch JSON with credentials included
 * Always returns structured result, never throws for non-2xx
 */
export async function fetchJson(url: string, init?: RequestInit): Promise<FetchJsonResult> {
  try {
    // CRITICAL: /api/auth/me must never be cached
    const isAuthMe = url.includes("/api/auth/me");
    const response = await fetch(url, {
      ...init,
      credentials: "include", // Always include cookies
      cache: isAuthMe ? "no-store" : init?.cache, // Force no-store for auth endpoint
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    // Always read response text first
    const text = await response.text();
    let json: any | null = null;
    
    // Try to parse JSON, but don't fail if it's not JSON
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // If JSON parse fails, json remains null
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
    };
  } catch (error) {
    // Only throw on actual network/fetch exceptions
    // Return structured error object if possible
    return {
      ok: false,
      status: 0,
      json: null,
      text: error instanceof Error ? error.message : "Network error",
    };
  }
}

