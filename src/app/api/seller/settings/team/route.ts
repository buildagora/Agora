import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getSupplierMembershipForUser } from "@/lib/supplier/membership.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/settings/team
 * Get team members and pending invites
 */
export async function GET(request: NextRequest) {
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
      return jsonError("FORBIDDEN", "Only organization admins can manage team settings", 403);
    }

    const prisma = getPrisma();

    // Get all members (ACTIVE and DISABLED)
    const members = await prisma.supplierMember.findMany({
      where: { supplierId: membership.supplierId },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, companyName: true },
        },
      },
      orderBy: [
        { role: "asc" }, // ADMIN first
        { createdAt: "asc" },
      ],
    });

    // Get pending invites (PENDING and not expired)
    const now = new Date();
    const pendingInvites = await prisma.supplierInvite.findMany({
      where: {
        supplierId: membership.supplierId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      include: {
        invitedBy: {
          select: { email: true, fullName: true, companyName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        fullName: m.user.fullName,
        companyName: m.user.companyName,
        role: m.role,
        status: m.status,
        verifiedAt: m.verifiedAt?.toISOString() || null,
      })),
      pendingInvites: pendingInvites.map((inv) => ({
        id: inv.id,
        email: inv.email,
        invitedBy: inv.invitedBy.email,
        invitedByName: inv.invitedBy.fullName || inv.invitedBy.companyName || inv.invitedBy.email,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
    });
  });
}

