import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getSupplierMembershipForUser } from "@/lib/supplier/membership.server";
import { randomBytes } from "crypto";
import { createHash } from "crypto";
import { sendSupplierTeamInviteEmail } from "@/lib/notifications/resend.server";
import { getBaseUrl } from "@/lib/urls/baseUrl.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/seller/settings/team/invite
 * Send team invite to email address
 * Requires ADMIN role and ACTIVE status
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    // Auth check
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Get supplier membership - explicitly check for ADMIN role
    const membership = await getSupplierMembershipForUser(user.id);
    if (!membership) {
      return jsonError("FORBIDDEN", "Seller account is not attached to an organization.", 403);
    }

    if (membership.role !== "ADMIN") {
      return jsonError("FORBIDDEN", "Only admins can invite team members", 403);
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { email } = body;
    if (!email || typeof email !== "string" || !email.trim()) {
      return jsonError("BAD_REQUEST", "Email is required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return jsonError("BAD_REQUEST", "Invalid email format", 400);
    }

    // Prevent self-invite
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });

    if (dbUser?.email?.toLowerCase() === normalizedEmail) {
      return jsonError("BAD_REQUEST", "You cannot invite yourself", 400);
    }

    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      const existingMembership = await prisma.supplierMember.findUnique({
        where: {
          supplierId_userId: {
            supplierId: membership.supplierId,
            userId: existingUser.id,
          },
        },
      });

      if (existingMembership && existingMembership.status === "ACTIVE") {
        return jsonError("BAD_REQUEST", "User is already a member of this supplier", 400);
      }
    }

    // Generate token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    // Check for existing PENDING invite (not expired)
    const now = new Date();
    const existingInvite = await prisma.supplierInvite.findFirst({
      where: {
        supplierId: membership.supplierId,
        email: normalizedEmail,
        status: "PENDING",
        expiresAt: { gt: now },
      },
    });

    let invite;
    if (existingInvite) {
      // Update existing invite with new token
      invite = await prisma.supplierInvite.update({
        where: { id: existingInvite.id },
        data: {
          tokenHash,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new invite
      invite = await prisma.supplierInvite.create({
        data: {
          supplierId: membership.supplierId,
          email: normalizedEmail,
          tokenHash,
          invitedByUserId: user.id,
          status: "PENDING",
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    }

    // Load supplier info for email
    const supplier = await prisma.supplier.findUnique({
      where: { id: membership.supplierId },
      select: { name: true },
    });

    // Send invite email
    try {
      await sendSupplierTeamInviteEmail({
        to: normalizedEmail,
        supplierName: supplier?.name || "Supplier",
        inviteToken: rawToken,
      });
    } catch (emailError) {
      // Log but don't fail the request
      console.error("[TEAM_INVITE_EMAIL_FAILED]", {
        inviteId: invite.id,
        email: normalizedEmail,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    return NextResponse.json({ 
      ok: true, 
      inviteId: invite.id,
      ...(process.env.NODE_ENV === "development" ? { 
        inviteUrl: `${getBaseUrl()}/seller/team/invite?token=${rawToken}` 
      } : {})
    });
  });
}

