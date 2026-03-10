/**
 * POST /api/auth/signup-from-invite
 * 
 * HOW TO TEST LOCALLY:
 * 1. Create a supplier admin account (or use existing)
 * 2. Send a team invite to a NEW email (e.g., test+invite@example.com)
 * 3. Click the invite link from email (should redirect to /seller/team/invite/signup?token=...)
 * 4. Fill in password and optional fullName, submit
 * 5. Should redirect to sign-in page with email pre-filled
 * 6. Sign in with the new account
 * 7. Should auto-redirect to /seller/team/invite?token=... (redeem page)
 * 8. Click "Accept Invitation"
 * 9. Verify:
 *    - User was created with role=SELLER
 *    - SupplierMember was created (supplierId from invite, userId=new user, role=MEMBER, status=ACTIVE)
 *    - NO new Supplier was created (user joined existing org)
 *    - Invite status changed to ACCEPTED
 * 10. Test existing user flow:
 *    - Send invite to email that already has account
 *    - Click invite link, should show signup form
 *    - Submit should return 409 and redirect to sign-in
 *    - Sign in, then redeem invite
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup-from-invite
 * Create a new SELLER user account from a team invite token
 * Does NOT create a new Supplier - user joins existing supplier org
 * Public endpoint (no auth required)
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { token, password, fullName } = body;

    // Validate required fields
    if (!token || typeof token !== "string" || !token.trim()) {
      return jsonError("BAD_REQUEST", "Token is required", 400);
    }

    if (!password || typeof password !== "string") {
      return jsonError("BAD_REQUEST", "Password is required", 400);
    }

    if (password.length < 6) {
      return jsonError("BAD_REQUEST", "Password must be at least 6 characters", 400);
    }

    // Hash token to find invite (same as redeem route)
    const tokenHash = createHash("sha256").update(token.trim()).digest("hex");

    const prisma = getPrisma();

    // Find invite with supplier relation
    const invite = await prisma.supplierInvite.findUnique({
      where: { tokenHash },
      include: {
        supplier: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invite) {
      return jsonError("NOT_FOUND", "Invalid or expired invite token", 404);
    }

    // Check status
    if (invite.status !== "PENDING") {
      return jsonError("BAD_REQUEST", "This invite has already been used or revoked", 400);
    }

    // Check expiration
    const now = new Date();
    if (invite.expiresAt < now) {
      // Mark as expired
      await prisma.supplierInvite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
      return jsonError("BAD_REQUEST", "This invite has expired", 400);
    }

    // Use invite email (lowercase)
    const normalizedEmail = invite.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return jsonError(
        "CONFLICT",
        "Account already exists — please sign in to accept invite.",
        409
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user, SupplierMember, and update invite in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create User (SELLER role, no categories required for invited team members)
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: "SELLER",
          fullName: fullName?.trim() || null,
          // IMPORTANT: Do NOT enforce categories requirement for invited team members
          // Set empty array as JSON string to satisfy schema
          categoriesServed: "[]",
          // Set terms agreement (required by schema validation)
          agreedToTermsAt: new Date(),
          agreedToTermsVersion: "v1-beta",
        },
      });

      // Create SupplierMember (link to existing supplier)
      await tx.supplierMember.create({
        data: {
          supplierId: invite.supplierId,
          userId: newUser.id,
          role: "MEMBER",
          status: "ACTIVE",
          verifiedAt: new Date(),
        },
      });

      // Mark invite as ACCEPTED
      await tx.supplierInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByUserId: newUser.id,
        },
      });

      return { newUser, supplierName: invite.supplier.name };
    });

    return NextResponse.json({
      ok: true,
      email: normalizedEmail,
      supplierName: result.supplierName,
    });
  });
}

