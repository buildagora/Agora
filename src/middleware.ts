import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken } from "@/lib/jwt";

/**
 * Middleware - The traffic cop for authentication routing
 * 
 * Enforces:
 * - Logged-out users → landing page (/)
 * - Logged-in users → app (redirected from / and /auth/*)
 * - CRITICAL: Role-based routing invariant - /seller/* never redirects to buyer, /buyer/* never redirects to seller
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // CRITICAL: Only check "agora.auth" cookie for authentication
  // Cookie name matches getAuthCookieName() from @/lib/jwt
  // Cannot import server-only modules in middleware, so hardcode the name
  // DO NOT check dev_login_token or any other cookies - only agora.auth is valid
  const authCookie = req.cookies.get("agora.auth");
  const isAuthenticated = Boolean(authCookie?.value);
  
  // CRITICAL: Verify JWT to get activeRole for role-based routing enforcement
  let activeRole: "BUYER" | "SELLER" | null = null;
  if (authCookie?.value) {
    try {
      const payload = await verifyAuthToken(authCookie.value);
      if (payload) {
        activeRole = payload.activeRole;
      }
    } catch {
      // JWT verification failed - treat as unauthenticated
      activeRole = null;
    }
  }

  // Public seller paths that don't require authentication
  // - /seller/login: Login page for sellers (must be accessible to unauthenticated users)
  // - /seller/signup: Supplier claim signup page (allows claiming existing seeded supplier orgs)
  // - /seller/team/invite: Team invite redemption page (invited users may not have accounts yet)
  // - /seller/team/invite/signup: Team invite signup page (allows new users to create account from invite)
  const publicSellerPaths = [
    "/seller/login",
    "/seller/signup",
    "/seller/team/invite",
  ];
  const isPublicSellerPath = publicSellerPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Public buyer paths that don't require authentication
  // - /buyer/login: Login page for buyers (must be accessible to unauthenticated users)
  const publicBuyerPaths = [
    "/buyer/login",
  ];
  const isPublicBuyerPath = publicBuyerPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Public auth paths that don't require authentication
  // - /auth/*: All authentication routes (sign-in, sign-up, etc.) must be accessible to unauthenticated users
  const publicAuthPaths = [
    "/auth",
  ];
  const isPublicAuthPath = publicAuthPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Redirect unauthenticated users from /seller/team/invite?token=... to signup page
  if (!isAuthenticated && pathname === "/seller/team/invite") {
    const token = req.nextUrl.searchParams.get("token");
    if (token) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/seller/team/invite/signup";
      redirectUrl.searchParams.set("token", token);
      // Extract original host from request URL to prevent 127.0.0.1 -> localhost normalization
      // req.url contains the original request URL with the actual host
      try {
        const requestUrl = new URL(req.url);
        if (requestUrl.host !== redirectUrl.host) {
          redirectUrl.host = requestUrl.host;
        }
      } catch {
        // If URL parsing fails, use redirectUrl as-is (shouldn't happen in normal operation)
      }
      return NextResponse.redirect(redirectUrl);
    }
  }

  // CRITICAL: Role-based routing invariant enforcement
  // /seller/* must NEVER redirect to buyer dashboard, even if activeRole is BUYER
  // /buyer/* must NEVER redirect to seller dashboard, even if activeRole is SELLER
  if (isAuthenticated && activeRole) {
    if (pathname.startsWith("/seller") && !isPublicSellerPath) {
      // User is accessing seller route
      if (activeRole === "BUYER") {
        // CRITICAL: Buyer accessing seller route - redirect to seller login with next param
        // This preserves the deep link and allows role switch
        // CRITICAL: Sanitize returnTo to prevent recursive redirects
        const currentPath = pathname + (req.nextUrl.search || "");
        const { sanitizeReturnTo } = await import("@/lib/auth/routeIntent");
        const sanitizedReturnTo = sanitizeReturnTo(currentPath);
        
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/seller/login";
        if (sanitizedReturnTo) {
          redirectUrl.searchParams.set("returnTo", sanitizedReturnTo);
        }
        return NextResponse.redirect(redirectUrl);
      }
      // activeRole is SELLER - allow through (seller layout will handle further checks)
    }
    
    if (pathname.startsWith("/buyer")) {
      // User is accessing buyer route
      if (activeRole === "SELLER") {
        // CRITICAL: Seller accessing buyer route - redirect to buyer login with next param
        // This preserves the deep link and allows role switch
        // CRITICAL: Sanitize returnTo to prevent recursive redirects
        const currentPath = pathname + (req.nextUrl.search || "");
        const { sanitizeReturnTo } = await import("@/lib/auth/routeIntent");
        const sanitizedReturnTo = sanitizeReturnTo(currentPath);
        
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/buyer/login";
        if (sanitizedReturnTo) {
          redirectUrl.searchParams.set("returnTo", sanitizedReturnTo);
        }
        return NextResponse.redirect(redirectUrl);
      }
      // activeRole is BUYER - allow through (buyer layout will handle further checks)
    }
  }

  // Logged-in users should NOT see landing or auth pages
  // Redirect authenticated users directly to their role-specific dashboard
  if (isAuthenticated && (pathname === "/" || pathname.startsWith("/auth"))) {
    const redirectUrl = req.nextUrl.clone();
    
    if (activeRole === "BUYER") {
      redirectUrl.pathname = "/buyer/dashboard";
    } else if (activeRole === "SELLER") {
      redirectUrl.pathname = "/seller/dashboard";
    } else {
      // Fallback if role is missing or invalid
      redirectUrl.pathname = "/";
    }
    
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Logged-out users should NOT access app pages
  // Protect buyer and seller routes (except public login/invite paths)
  if (!isAuthenticated) {
    // CRITICAL: /auth/* routes must always be public for unauthenticated users
    if (isPublicAuthPath) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/buyer") && !isPublicBuyerPath) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
    if (pathname.startsWith("/seller") && !isPublicSellerPath) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/auth/:path*",
    "/buyer/:path*",
    "/seller/:path*",
  ],
};

