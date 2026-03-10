/**
 * POST /api/auth/switch-role
 * Switch the active role in the current session
 * 
 * Updates the JWT token with a new activeRole and re-issues the session cookie.
 * This is the canonical way to switch roles without logging out.
 * 
 * Body: { "targetRole": "BUYER" | "SELLER" }
 * 
 * Returns: { ok: true, user: AuthUser } with updated activeRole
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { verifyAuthToken, signAuthToken, getAuthCookieName } from "@/lib/jwt";
import { setAuthCookie } from "@/lib/auth/handlers";
import { getPrisma } from "@/lib/db.server";
import type { UserRole } from "@/lib/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Get current user (must be authenticated)
    const requestObj = new Request(request.url, {
      method: request.method,
      headers: request.headers,
    });
    const user = await requireCurrentUserFromRequest(requestObj);

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { targetRole } = body as { targetRole?: unknown };

    // Validate targetRole
    if (targetRole !== "BUYER" && targetRole !== "SELLER") {
      return NextResponse.json(
        { ok: false, error: "targetRole must be 'BUYER' or 'SELLER'" },
        { status: 400 }
      );
    }

    // Verify user has this role (for now, check database role)
    // TODO: If users can have multiple roles, check roles array
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    const dbRole = (dbUser.role as UserRole) || "BUYER";
    // For now, users have single role - verify it matches
    // TODO: If users can have multiple roles, check if targetRole is in roles array
    if (dbRole !== targetRole) {
      return NextResponse.json(
        { ok: false, error: `User does not have ${targetRole} role` },
        { status: 403 }
      );
    }

    // Read current JWT token to preserve other claims
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
      return NextResponse.json(
        { ok: false, error: "No session found" },
        { status: 401 }
      );
    }

    const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      if (key && value) {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {} as Record<string, string>);

    const token = cookies[getAuthCookieName()];
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "No session found" },
        { status: 401 }
      );
    }

    // Verify current token
    const payload = await verifyAuthToken(token);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    // Create new JWT with updated activeRole
    const newToken = await signAuthToken({
      userId: payload.userId,
      activeRole: targetRole,
    });

    // Format user response
    let categoriesServed: string[] = [];
    if (dbUser.categoriesServed) {
      try {
        categoriesServed = JSON.parse(dbUser.categoriesServed);
      } catch {
        categoriesServed = [];
      }
    }

    const userRoles: UserRole[] = [dbRole]; // For now, single role

    // Create response with updated user
    // CRITICAL: Always include both `role` (alias) and `activeRole` for backward compatibility
    const response = NextResponse.json(
      {
        ok: true,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          role: targetRole, // Alias for backward compatibility
          activeRole: targetRole,
          roles: userRoles,
          categoriesServed,
          companyName: dbUser.companyName || undefined,
          fullName: dbUser.fullName || undefined,
          phone: dbUser.phone || undefined,
          serviceArea: dbUser.serviceArea || undefined,
        },
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );

    // Set new cookie with updated activeRole
    setAuthCookie(response, newToken);

    // Log role switch
    if (process.env.NODE_ENV === "development") {
      console.log("[SWITCH_ROLE]", {
        userId: user.id,
        oldActiveRole: payload.activeRole,
        newActiveRole: targetRole,
      });
    }

    return response;
  } catch (error: any) {
    console.error("[SWITCH_ROLE_ERROR]", {
      error: error?.message || String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

