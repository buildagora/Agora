/**
 * Route intent helpers for authentication and navigation
 * Client-safe utilities (no server-only dependencies)
 */

import type { UserRole } from "./types";

/**
 * Check if seller has completed setup (has categories or company name)
 */
function sellerHasSetup(categoriesServed?: string[] | null, companyName?: string | null, fullName?: string | null): boolean {
  const hasCategories = Array.isArray(categoriesServed) && categoriesServed.length > 0;
  const hasDisplayName = !!(companyName?.trim() || fullName?.trim());
  return hasCategories || hasDisplayName;
}

/**
 * Get the dashboard path for a given role
 * @param role User role (BUYER, SELLER, or ADMIN)
 * @param sellerSetup Optional seller setup info (categoriesServed, companyName, fullName)
 * @returns Dashboard path for the role
 */
export function getDashboardForRole(
  role: UserRole,
  sellerSetup?: {
    categoriesServed?: string[] | null;
    companyName?: string | null;
    fullName?: string | null;
  }
): string {
  switch (role) {
    case "BUYER":
      return "/buyer/dashboard";
    case "SELLER":
      // If seller has setup (categories or display name), go to dashboard
      // Otherwise go to feed (which may redirect to onboarding)
      if (sellerSetup && sellerHasSetup(sellerSetup.categoriesServed, sellerSetup.companyName, sellerSetup.fullName)) {
        return "/seller/dashboard";
      }
      return "/seller/feed";
    default:
      // Fallback for any other role (including ADMIN if added later)
      return "/admin";
  }
}

/**
 * List of auth/login pages that should never be used as returnTo destinations
 */
const AUTH_PAGES = [
  "/buyer/login",
  "/seller/login",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/switch-role",
  "/seller/team/invite/signup",
];

/**
 * Check if a path is an auth/login page
 */
function isAuthPage(path: string): boolean {
  if (!path) return false;
  const normalizedPath = path.split("?")[0]; // Strip query params for comparison
  return AUTH_PAGES.some((authPage) => normalizedPath === authPage || normalizedPath.startsWith(authPage + "/"));
}

/**
 * Extract nested returnTo from a URL string recursively
 * Handles nested returnTo params like: /buyer/login?returnTo=/buyer/login?returnTo=...
 */
function extractNestedReturnTo(path: string): string | null {
  try {
    const url = new URL(path, "http://localhost");
    let returnTo = url.searchParams.get("returnTo") || url.searchParams.get("next");
    
    // If returnTo itself contains another returnTo, extract the innermost one
    if (returnTo) {
      const nested = extractNestedReturnTo(returnTo);
      if (nested) {
        return nested;
      }
    }
    
    return returnTo;
  } catch {
    // If URL parsing fails, try manual extraction
    const returnToMatch = path.match(/[?&]returnTo=([^&]+)/) || path.match(/[?&]next=([^&]+)/);
    if (returnToMatch) {
      const decoded = decodeURIComponent(returnToMatch[1]);
      const nested = extractNestedReturnTo(decoded);
      return nested || decoded;
    }
    return null;
  }
}

/**
 * Sanitize a returnTo path parameter
 * Rejects full URLs, paths not starting with "/", double-slash paths, and auth/login pages
 * Also strips nested returnTo recursion
 * @param returnTo The returnTo path to sanitize
 * @returns Sanitized path, or empty string if invalid
 */
export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) {
    return "";
  }

  // Decode the returnTo to handle URL encoding
  let decoded: string;
  try {
    decoded = decodeURIComponent(returnTo);
  } catch {
    decoded = returnTo;
  }

  // Extract nested returnTo if present (handles recursion)
  const nestedReturnTo = extractNestedReturnTo(decoded);
  const finalReturnTo = nestedReturnTo || decoded;

  // Reject full URLs (http/https)
  if (finalReturnTo.startsWith("http://") || finalReturnTo.startsWith("https://")) {
    return "";
  }

  // Reject paths not starting with "/"
  if (!finalReturnTo.startsWith("/")) {
    return "";
  }

  // Reject paths starting with "//"
  if (finalReturnTo.startsWith("//")) {
    return "";
  }

  // Extract pathname for auth page check (strip query params)
  const pathname = finalReturnTo.split("?")[0];

  // CRITICAL: Reject auth/login pages to prevent recursive redirects
  if (isAuthPage(pathname)) {
    return "";
  }

  return finalReturnTo;
}

/**
 * Validate a returnTo path for safety and role match
 * @param path The path to validate
 * @param role The user's role
 * @returns true if the path is safe and matches the role, false otherwise
 */
export function validateReturnTo(path: string, role: UserRole): boolean {
  // First sanitize the path
  const sanitized = sanitizeReturnTo(path);
  if (!sanitized) {
    return false;
  }

  // Check role match
  if (role === "BUYER" && !sanitized.startsWith("/buyer")) {
    return false;
  }

  if (role === "SELLER" && !sanitized.startsWith("/seller")) {
    return false;
  }

  // Path is safe and matches role
  return true;
}

