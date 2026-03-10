/**
 * Server-only auth helpers
 * These functions require server-side access to cookies, JWT, and database
 */

import "server-only";
import type { User, UserRole } from "./types";

/**
 * Server-side auth helper
 * Reads JWT token from HttpOnly cookie and loads user from database
 * 
 * ⚠️ AUTH CONTRACT:
 * 
 * PRODUCTION:
 * - Auth is derived ONLY from HttpOnly cookies
 * - HttpOnly cookies are intentionally invisible to JavaScript (document.cookie cannot read them)
 * - Cookies are never read from document.cookie (browser JS cannot access HttpOnly cookies)
 * - No localStorage / headers / fallbacks exist in production path
 * - curl WILL fail unless cookies are explicitly provided (this is expected and correct behavior)
 * - This ensures production security: cookies cannot be stolen via XSS
 * 
 * DEVELOPMENT:
 * - Supports x-dev-user-id header for testing (bypasses cookie/JWT)
 * - Dev header auth is ONLY active when NODE_ENV === "development"
 * - Dev header auth is NEVER active in production
 * - Cookie auth is production-only and always preferred
 * 
 * ROLE ENFORCEMENT:
 * - Mixing roles (BUYER accessing SELLER routes, etc.) is intentionally forbidden
 * - Role boundaries are hard-enforced at layout level
 * - Session switching requires explicit logout/login
 */
export async function getCurrentUserFromRequest(request: Request): Promise<User | null> {
  try {
    // DEV-ONLY: Check for x-dev-user-id header (development testing only)
    // This MUST run before cookie validation to allow dev header override
    // This MUST be unreachable in production
    if (process.env.NODE_ENV === "development" && request.headers.get("x-dev-user-id")) {
      const { getPrisma } = await import("../db.server");
      const prisma = getPrisma();
      const devUserId = request.headers.get("x-dev-user-id");
      
      if (devUserId) {
        const devUser = await prisma.user.findUnique({
          where: { id: devUserId },
        });

        if (devUser) {
    // For dev header auth, use database role as activeRole
    const dbRole = (devUser.role as UserRole) || "BUYER";
    const roles: UserRole[] = [dbRole];

    // Map Prisma user to User type (same format as cookie auth)
    return {
      id: devUser.id,
      email: devUser.email,
      fullName: devUser.fullName || "",
      companyName: devUser.companyName || "",
      role: dbRole, // Legacy field
      activeRole: dbRole, // For dev header, use DB role
      roles, // All roles user has
      createdAt: devUser.createdAt.toISOString(),
    };
        }
      }
    }

    // PRODUCTION PATH: Cookie-based auth only
    const { verifyAuthToken, getAuthCookieName } = await import("../jwt");
    const { getPrisma } = await import("../db.server");

    // Read auth cookie
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
      return null;
    }

    // Parse cookies
    const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      if (key && value) {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);

    const token = cookies[getAuthCookieName()];
    if (!token) {
      return null;
    }

    // Verify JWT token
    const payload = await verifyAuthToken(token);
    if (!payload) {
      return null;
    }

    // Load user from database (server-side, single source of truth)
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!dbUser) {
      return null;
    }

    // activeRole comes from JWT token (canonical source of truth)
    const activeRole = payload.activeRole;
    const dbRole = (dbUser.role as UserRole) || "BUYER";
    // For now, users have single role in DB, so roles array is just [dbRole]
    // TODO: If users can have multiple roles, derive from database
    const roles: UserRole[] = [dbRole];

    // Map Prisma user to User type
    // activeRole comes from JWT, not database
    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName || "",
      companyName: dbUser.companyName || "",
      role: dbRole, // Legacy field
      activeRole, // REQUIRED - from JWT
      roles, // All roles user has
      createdAt: dbUser.createdAt.toISOString(),
    };
  } catch (error) {
    console.error("AUTH_ERROR", error);
    return null;
  }
}

/**
 * Require authenticated user from request
 * Throws error that returns 401 if user is not authenticated
 * 
 * ⚠️ DEV-ONLY OVERRIDE:
 * In development, accepts x-dev-user-id header to bypass cookie auth for testing.
 * This allows curl/scripts to authenticate without managing cookies.
 * 
 * PRODUCTION BEHAVIOR:
 * - Only HttpOnly cookies are accepted
 * - Header-based auth is NEVER allowed in production
 * - This ensures production security is never weakened
 */
export async function requireCurrentUserFromRequest(request: Request): Promise<User> {
  // DEV-ONLY AUTH OVERRIDE (NEVER ACTIVE IN PROD)
  // This MUST run before cookie validation
  // This MUST be unreachable in production
  // This MUST NOT accept emails, roles, or tokens — ID only
  if (
    process.env.NODE_ENV === "development" &&
    request.headers.get("x-dev-user-id")
  ) {
    const { getPrisma } = await import("../db.server");
    const prisma = getPrisma();
    const devUserId = request.headers.get("x-dev-user-id");
    
    if (!devUserId) {
      throw new Error("UNAUTHORIZED");
    }

    const devUser = await prisma.user.findUnique({
      where: { id: devUserId },
    });

    if (!devUser) {
      throw new Error("DEV_AUTH_USER_NOT_FOUND");
    }

    // For dev header auth, use database role as activeRole
    const dbRole = (devUser.role as UserRole) || "BUYER";
    const roles: UserRole[] = [dbRole];

    // Map Prisma user to User type (same format as cookie auth)
    return {
      id: devUser.id,
      email: devUser.email,
      fullName: devUser.fullName || "",
      companyName: devUser.companyName || "",
      role: dbRole, // Legacy field
      activeRole: dbRole, // For dev header, use DB role
      roles, // All roles user has
      createdAt: devUser.createdAt.toISOString(),
    };
  }

  // PRODUCTION PATH: Cookie-based auth only
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
