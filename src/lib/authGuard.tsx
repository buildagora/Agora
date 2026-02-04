"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./auth/AuthProvider";
import type { UserRole } from "./auth/types";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  redirectTo?: string;
}

/**
 * AuthGuard - CRITICAL: Route intent enforcement
 * 
 * INVARIANT: Route intent (seller/buyer) > existing session role
 * 
 * SAFETY INVARIANT:
 * - It must be impossible for a BUYER-authenticated session to ever render a /seller/* page
 * - It must be impossible for a SELLER-authenticated session to ever render a /buyer/* page
 * 
 * Rules:
 * - Render null during loading (NO redirects)
 * - If unauthenticated: redirect to role-specific login with returnTo parameter
 * - If authenticated but wrong role:
 *   - Keep session intact (DO NOT clear cookies)
 *   - Redirect to /auth/switch-role page (NOT buyer dashboard)
 *   - Log role-mismatch attempt (non-destructive)
 * - NEVER redirect to wrong dashboard
 * - NEVER clear session on role mismatch
 * - NEVER show 404/NotFound for role mismatch
 */
export default function AuthGuard({
  children,
  requiredRole,
  redirectTo,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status } = useAuth();
  const roleMismatchHandledRef = useRef(false);

  // Handle all redirects in useEffect (never during render)
  useEffect(() => {
    // Don't redirect while loading
    if (status === "loading") {
      return;
    }

    // 🚨 CRITICAL: NEVER redirect if already on a login route (prevents infinite loop)
    const isLoginRoute = pathname?.startsWith("/buyer/login") || 
                         pathname?.startsWith("/seller/login") ||
                         pathname?.startsWith("/auth/");
    
    if (isLoginRoute) {
      return; // Stop here - login pages are public and unguarded
    }

    // If unauthenticated: redirect to role-specific login with returnTo
    // AuthGuard must NEVER redirect on /auth/* or login routes (checked above)
    if (status === "unauthenticated") {
      const currentPath = typeof window !== "undefined" 
        ? window.location.pathname + window.location.search 
        : "";
      
      // Determine route intent from pathname
      const routeIntent = requiredRole || (pathname?.startsWith("/seller/") ? "SELLER" : pathname?.startsWith("/buyer/") ? "BUYER" : null);
      
      // Build returnTo parameter
      const returnToParam = currentPath ? `returnTo=${encodeURIComponent(currentPath)}` : "";
      
      // Redirect to role-specific login
      let loginPath: string;
      if (routeIntent === "SELLER") {
        loginPath = returnToParam ? `/seller/login?${returnToParam}` : "/seller/login";
      } else if (routeIntent === "BUYER") {
        loginPath = returnToParam ? `/buyer/login?${returnToParam}` : "/buyer/login";
      } else {
        // Fallback to generic sign-in
        const nextParam = currentPath ? `?next=${encodeURIComponent(currentPath)}` : "";
        loginPath = redirectTo || `/auth/sign-in${nextParam}`;
      }
      
      router.replace(loginPath);
      return;
    }

    // Must be authenticated with user at this point
    if (status !== "authenticated" || !user) {
      return;
    }

    // CRITICAL: If authenticated but wrong role - redirect to switch-role page
    // DO NOT clear session - keep user logged in
    // DO NOT redirect to buyer dashboard - show switch-role UI instead
    if (requiredRole && user.role !== requiredRole) {
      // Prevent duplicate handling
      if (roleMismatchHandledRef.current) {
        return;
      }
      roleMismatchHandledRef.current = true;

      // REGRESSION GUARD: Log role-mismatch attempt (non-destructive)
      if (process.env.NODE_ENV === "development") {
        console.warn("[AUTH_ROLE_MISMATCH]", {
          routeIntent: requiredRole,
          currentUserRole: user.role,
          pathname: pathname,
          message: "Route intent does not match user role - redirecting to switch-role page (session preserved)",
        });
      }

      // Build current path with query string for returnTo
      const currentPath = typeof window !== "undefined" 
        ? window.location.pathname + window.location.search 
        : pathname || "";
      
      // Redirect to switch-role page with target role and returnTo
      const returnToParam = currentPath ? `&returnTo=${encodeURIComponent(currentPath)}` : "";
      const switchRolePath = `/auth/switch-role?target=${requiredRole}${returnToParam}`;
      
      router.replace(switchRolePath);
      return;
    }

    // Reset mismatch flag if role matches
    if (requiredRole && user.role === requiredRole) {
      roleMismatchHandledRef.current = false;
    }
  }, [status, user, requiredRole, pathname, router, redirectTo]);

  // TASK 2: Render null during loading (NO redirects)
  if (status === "loading") {
    return null;
  }

  // Authenticated but user is null - still loading
  if (status === "authenticated" && !user) {
    return null;
  }

  // TASK 2: Not authenticated - return null (redirect happens in effect)
  // 🚨 CRITICAL: Login routes are public - always render children
  if (status === "unauthenticated") {
    const isLoginRoute = pathname?.startsWith("/buyer/login") || 
                         pathname?.startsWith("/seller/login") ||
                         pathname?.startsWith("/auth/");
    
    if (isLoginRoute) {
      return <>{children}</>; // Login pages are public
    }
    return null;
  }

  // Must be authenticated with user at this point
  if (status !== "authenticated" || !user) {
    return null;
  }

  // TASK 2: Wrong role - return null (redirect happens in effect)
  if (requiredRole && user.role !== requiredRole) {
    return null;
  }

  // Authenticated and role matches - render children
  return <>{children}</>;
}
