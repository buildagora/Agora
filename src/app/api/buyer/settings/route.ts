/**
 * Buyer Settings API
 * Allows buyers to update their profile information
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Query Prisma directly for user data (database is source of truth)
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyName: true, fullName: true, phone: true },
    });

    if (!dbUser) {
      return jsonError("NOT_FOUND", "User not found", 404);
    }

    // Return current user profile data
    return jsonOk({
      companyName: dbUser.companyName || null,
      fullName: dbUser.fullName || null,
      phone: dbUser.phone || null,
    }, 200);
  });
}

export async function PATCH(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { companyName, fullName, phone } = body;

    // Build update data object (trim strings, treat blank strings as null)
    const updateData: {
      companyName?: string | null;
      fullName?: string | null;
      phone?: string | null;
    } = {};

    if (companyName !== undefined) {
      updateData.companyName = companyName?.trim() || null;
    }
    if (fullName !== undefined) {
      updateData.fullName = fullName?.trim() || null;
    }
    if (phone !== undefined) {
      updateData.phone = phone?.trim() || null;
    }

    // Update user in database
    const prisma = getPrisma();
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        companyName: true,
        fullName: true,
        phone: true,
      },
    });

    return jsonOk({
      companyName: updatedUser.companyName || null,
      fullName: updatedUser.fullName || null,
      phone: updatedUser.phone || null,
    }, 200);
  });
}

