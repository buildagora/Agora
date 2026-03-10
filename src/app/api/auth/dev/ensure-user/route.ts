/**
 * DEV-ONLY: Ensure test user exists
 * 
 * This endpoint ensures a test user exists in the database with a known password.
 * Used for testing auth flows when PrismaClient requires adapter/accelerateUrl.
 * 
 * ⚠️ HARD-FAIL IN PRODUCTION: Returns 404 if NODE_ENV === "production"
 */

import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/auth/schemas";
import { getPrisma } from "@/lib/db.server";
import bcrypt from "bcryptjs";
import { labelToCategoryId } from "@/lib/categoryIds";
import type { CategoryId } from "@/lib/categoryIds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/dev/ensure-user
 * 
 * Ensures a test user exists with the specified credentials.
 * 
 * Body:
 * {
 *   "email": string,
 *   "password": string,
 *   "role": "BUYER" | "SELLER",
 *   "companyName"?: string,
 *   "fullName"?: string,
 *   "categoryIds"?: string[]   // only relevant for SELLER
 * }
 * 
 * Returns:
 * {
 *   "ok": true,
 *   "user": { id, email, role, companyName, fullName, categoriesServed }
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // HARD-FAIL IN PRODUCTION
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error: "FORBIDDEN",
        message: "Not available in production",
      },
      { status: 403 }
    );
  }

  // Set Cache-Control: no-store
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");

  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "Invalid JSON",
        },
        { status: 400, headers }
      );
    }

    // Validate required fields
    const { email, password, role, companyName, fullName, categoryIds } = body as {
      email?: string;
      password?: string;
      role?: string;
      companyName?: string;
      fullName?: string;
      categoryIds?: string[];
    };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "email is required",
        },
        { status: 400, headers }
      );
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "password is required",
        },
        { status: 400, headers }
      );
    }

    if (!role || (role !== "BUYER" && role !== "SELLER")) {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "role must be BUYER or SELLER",
        },
        { status: 400, headers }
      );
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: "BAD_REQUEST",
          message: "Invalid email address",
        },
        { status: 400, headers }
      );
    }

    // Normalize categoryIds (for SELLER)
    const normalizedCategoryIds: CategoryId[] = [];
    if (role === "SELLER" && categoryIds && Array.isArray(categoryIds)) {
      const seenIds = new Set<string>();
      for (const entry of categoryIds) {
        if (!entry) continue;
        const trimmed = String(entry).trim();
        if (!trimmed) continue;

        const lowerTrimmed = trimmed.toLowerCase();
        let foundCategoryId: CategoryId | null = null;

        // Try exact label match (case-insensitive)
        for (const [label, categoryId] of Object.entries(labelToCategoryId)) {
          if (label.toLowerCase() === lowerTrimmed) {
            foundCategoryId = categoryId;
            break;
          }
        }

        // If not found as label, check if it's already a valid categoryId (case-insensitive)
        if (!foundCategoryId) {
          const validCategoryIds = Object.values(labelToCategoryId) as CategoryId[];
          for (const categoryId of validCategoryIds) {
            if (categoryId.toLowerCase() === lowerTrimmed) {
              foundCategoryId = categoryId;
              break;
            }
          }
        }

        // If still not found, assume it's already a DB categoryId and use as-is
        if (!foundCategoryId) {
          foundCategoryId = trimmed as CategoryId;
        }

        // De-dupe
        if (foundCategoryId && !seenIds.has(foundCategoryId)) {
          normalizedCategoryIds.push(foundCategoryId);
          seenIds.add(foundCategoryId);
        }
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Get Prisma client
    const prisma = getPrisma();

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Prepare user data
    const userData: {
      email: string;
      passwordHash: string;
      role: string;
      fullName?: string;
      companyName?: string;
      categoriesServed?: string;
    } = {
      email: normalizedEmail,
      passwordHash, // Always update passwordHash
      role,
    };

    if (fullName?.trim()) {
      userData.fullName = fullName.trim();
    }
    if (companyName?.trim()) {
      userData.companyName = companyName.trim();
    }

    // SELLER users MUST have categoriesServed
    if (role === "SELLER") {
      if (normalizedCategoryIds.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "BAD_REQUEST",
            message: "At least one category is required for SELLER accounts",
          },
          { status: 400, headers }
        );
      }
      userData.categoriesServed = JSON.stringify(normalizedCategoryIds);
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: userData,
      create: userData,
    });

    // Parse categoriesServed for response
    let categoriesServed: string[] = [];
    if (user.categoriesServed) {
      try {
        categoriesServed = JSON.parse(user.categoriesServed);
      } catch {
        // Invalid JSON, treat as empty
      }
    }

    // Determine activeRole and roles
    const dbRole = (user.role === "BUYER" || user.role === "SELLER") ? user.role : "BUYER";
    const activeRole: "BUYER" | "SELLER" = dbRole;
    const userRoles: ("BUYER" | "SELLER")[] = [dbRole]; // For now, single role

    // Dev log
    console.log("[DEV_ENSURE_USER]", {
      email: normalizedEmail,
      role,
      action: existingUser ? "updated" : "created",
      userId: user.id,
      hasCategories: categoriesServed.length > 0,
    });

    // Return success response (no passwordHash)
    // CRITICAL: Always include both `role` (alias) and `activeRole` for backward compatibility
    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: activeRole, // Alias for backward compatibility
          activeRole,
          roles: userRoles,
          categoriesServed,
          companyName: user.companyName || undefined,
          fullName: user.fullName || undefined,
          phone: user.phone || undefined,
          serviceArea: user.serviceArea || undefined,
        },
      },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("[DEV_ENSURE_USER_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Failed to ensure user",
      },
      { status: 500, headers }
    );
  }
}


