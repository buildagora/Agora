/**
 * Client-side role enforcement utilities
 * Preserves deep links by using role-specific login routes with returnTo
 * Never routes to /auth/sign-in directly (AuthGuard handles that)
 */

"use client";

/**
 * Get current path with search params (safe for SSR)
 * Returns window.location.pathname + window.location.search
 */
export function getCurrentPathWithSearch(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return window.location.pathname + window.location.search;
}

/**
 * Build role-specific login URL with returnTo preserved
 * @param requiredRole The role required to access the page
 * @param returnTo The path to return to after login
 * @returns Login path with returnTo query param
 */
export function buildRoleLoginUrl(requiredRole: "BUYER" | "SELLER", returnTo: string): string {
  const encodedReturnTo = encodeURIComponent(returnTo);
  
  if (requiredRole === "SELLER") {
    return `/seller/login?returnTo=${encodedReturnTo}`;
  } else {
    return `/buyer/login?returnTo=${encodedReturnTo}`;
  }
}

/**
 * Build switch-role URL with returnTo preserved
 * @param targetRole The role the user needs to switch to
 * @param returnTo The path to return to after switching
 * @returns Switch-role path with target and returnTo query params
 */
export function buildSwitchRoleUrl(targetRole: "BUYER" | "SELLER", returnTo: string): string {
  const encodedReturnTo = encodeURIComponent(returnTo);
  
  return `/auth/switch-role?target=${targetRole}&returnTo=${encodedReturnTo}`;
}

/**
 * Enforce role requirement client-side
 * Routes to correct login/switch-role path with returnTo preserved
 * @param params Configuration parameters
 * @returns true if role matches, false if navigation occurred
 */
export function enforceRoleClient(params: {
  userRole?: "BUYER" | "SELLER" | null;
  requiredRole: "BUYER" | "SELLER";
  routerReplace: (url: string) => void;
}): boolean {
  const { userRole, requiredRole, routerReplace } = params;
  const returnTo = getCurrentPathWithSearch();
  
  // If no user role, route to role-specific login
  if (!userRole) {
    routerReplace(buildRoleLoginUrl(requiredRole, returnTo));
    return false;
  }
  
  // If wrong role, route to switch-role page
  if (userRole !== requiredRole) {
    routerReplace(buildSwitchRoleUrl(requiredRole, returnTo));
    return false;
  }
  
  // Role matches
  return true;
}
