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
 * Sanitize a returnTo path parameter
 * Rejects full URLs, paths not starting with "/", and double-slash paths
 * @param returnTo The returnTo path to sanitize
 * @returns Sanitized path, or empty string if invalid
 */
export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) {
    return "";
  }

  // Reject full URLs (http/https)
  if (returnTo.startsWith("http://") || returnTo.startsWith("https://")) {
    return "";
  }

  // Reject paths not starting with "/"
  if (!returnTo.startsWith("/")) {
    return "";
  }

  // Reject paths starting with "//"
  if (returnTo.startsWith("//")) {
    return "";
  }

  return returnTo;
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

