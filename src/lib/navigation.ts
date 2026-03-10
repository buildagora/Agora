"use client";

import type { User } from "./auth/types";

/**
 * CRITICAL: Single source of truth for dashboard routing
 * @param user Optional user object from useAuth() hook
 * @returns Dashboard route based on authenticated user's role
 */
export function getDashboardRoute(user?: User | null): string {
  if (!user || !user.role) {
    return "/auth/sign-in";
  }
  
  if (user.role === "BUYER") {
    return "/buyer/dashboard";
  } else if (user.role === "SELLER") {
    // CRITICAL: Seller home is /seller/dashboard
    return "/seller/dashboard";
  }
  
  return "/auth/sign-in";
}

/**
 * Navigate to dashboard based on authenticated user role
 * This is the ONLY function that should be used for dashboard navigation
 * @param router Router instance with push method
 * @param user Optional user object from useAuth() hook
 */
export function goToDashboard(router: { push: (path: string) => void }, user?: User | null): void {
  const route = getDashboardRoute(user);
  
  if (process.env.NODE_ENV === "development") {
    console.log("🧭 goToDashboard", {
      route,
      userRole: user?.role,
      userId: user?.id,
    });
  }
  
  router.push(route);
}

