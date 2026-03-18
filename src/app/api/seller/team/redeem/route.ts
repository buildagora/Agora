import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/seller/team/redeem
 * Redeem an invite token
 * Requires authenticated user
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

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { token } = body;
    if (!token || typeof token !== "string" || !token.trim()) {
      return jsonError("BAD_REQUEST", "Token is required", 400);
    }

    // Hash token to find invite
    const tokenHash = createHash("sha256").update(token.trim()).digest("hex");

    const prisma = getPrisma();

    // Find invite
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

    // Verify email matches (if invite has email)
    if (invite.email) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true },
      });

      if (dbUser?.email?.toLowerCase() !== invite.email.toLowerCase()) {
        return jsonError("FORBIDDEN", "This invite was sent to a different email address", 403);
      }
    }

    // Check if user is already a member (idempotent)
    const existingMembership = await prisma.supplierMember.findUnique({
      where: {
        supplierId_userId: {
          supplierId: invite.supplierId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      // Already a member - mark invite as accepted anyway (idempotent)
      if (invite.status === "PENDING") {
        await prisma.supplierInvite.update({
          where: { id: invite.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedByUserId: user.id,
          },
        });
      }
      return NextResponse.json({
        ok: true,
        supplierId: invite.supplierId,
        supplierName: invite.supplier.name,
        alreadyMember: true,
      });
    }

    // Create SupplierMember
    await prisma.supplierMember.create({
      data: {
        supplierId: invite.supplierId,
        userId: user.id,
        role: "MEMBER",
        status: "ACTIVE",
        verifiedAt: new Date(),
      },
    });

    // Mark invite as accepted
    await prisma.supplierInvite.update({
      where: { id: invite.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      supplierId: invite.supplierId,
      supplierName: invite.supplier.name,
    });
  });
}



