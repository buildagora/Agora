import "server-only";

/**
 * Get the absolute base URL for the application.
 * Used for generating email links and other absolute URLs.
 * 
 * Priority order:
 * 1. NEXT_PUBLIC_BASE_URL environment variable (trimmed, trailing slash removed)
 * 2. Development default: "http://127.0.0.1:3000" (NOT localhost to avoid cookie issues)
 * 3. Production: throws error if not set
 * 
 * @returns Absolute base URL (e.g., "http://127.0.0.1:3000" or "https://example.com")
 * @throws Error in production if NEXT_PUBLIC_BASE_URL is not set
 */
export function getBaseUrl(): string {
  // Priority 1: Use environment variable if set
  const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (envBaseUrl) {
    return envBaseUrl.trim().replace(/\/+$/, ""); // Trim and remove trailing slashes
  }

  // Priority 2: Development default (use 127.0.0.1, not localhost, to avoid cookie origin issues)
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:3000";
  }

  // Priority 3: Production requires explicit configuration
  throw new Error(
    "NEXT_PUBLIC_BASE_URL is not set. Please set NEXT_PUBLIC_BASE_URL in your environment variables."
  );
}


