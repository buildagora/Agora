/**
 * POST /api/auth/dev-login
 * DEV-ONLY: Development login endpoint
 * 
 * Allows logging in as any user by userId (development/testing only)
 * 
 * Requirements:
 * - Only enabled when NODE_ENV !== "production" OR ALLOW_DEV_LOGIN === "true"
 * - Accepts JSON body { "userId": string }
 * - Sets the same HttpOnly auth cookie as normal login
 * - Returns user data in same format as normal login
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { signAuthToken } from "@/lib/jwt";
import { setAuthCookie } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // DEV-ONLY: Only enabled in development or when ALLOW_DEV_LOGIN is set
  const isDev = process.env.NODE_ENV !== "production";
  const allowDevLogin = process.env.ALLOW_DEV_LOGIN === "true";
  
  if (!isDev && !allowDevLogin) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 }
    );
  }

  try {
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

    const { userId, email, role } = body as { userId?: unknown; email?: unknown; role?: unknown };

    // Fetch user using Prisma
    const prisma = getPrisma();
    let user;

    // Priority: role > email > userId
    if (role && (role === "BUYER" || role === "SELLER")) {
      // Find first user with this role
      user = await prisma.user.findFirst({
        where: { role: role as "BUYER" | "SELLER" },
      });
      if (!user) {
        return NextResponse.json(
          { ok: false, error: `No user found with role ${role}` },
          { status: 404 }
        );
      }
    } else if (email && typeof email === "string" && email.trim()) {
      // Find user by email
      user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      if (!user) {
        return NextResponse.json(
          { ok: false, error: "User not found" },
          { status: 404 }
        );
      }
    } else if (userId && typeof userId === "string" && userId.trim()) {
      // Find user by id
      user = await prisma.user.findUnique({
        where: { id: userId.trim() },
      });
      if (!user) {
        return NextResponse.json(
          { ok: false, error: "User not found" },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, error: "Must provide userId, email, or role" },
        { status: 400 }
      );
    }

    // Mint a JWT the same way as normal login (same secret, same claims)
    const token = await signAuthToken({ userId: user.id });

    // Create response with user data (same format as normal login)
    const response = NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role as "BUYER" | "SELLER",
        },
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );

    // Set the same HttpOnly auth cookie as normal login uses
    // Uses the existing setAuthCookie helper for consistency
    setAuthCookie(response, token);

    // Log dev login action
    console.log("[DEV_LOGIN] set-cookie", {
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    return response;
  } catch (error: any) {
    console.error("[DEV_LOGIN_ERROR]", {
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
