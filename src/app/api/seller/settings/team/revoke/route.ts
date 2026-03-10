import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getSupplierMembershipForUser } from "@/lib/supplier/membership.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/seller/settings/team/revoke
 * Revoke a pending invite
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
      return jsonError("FORBIDDEN", "Only admins can revoke invites", 403);
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { inviteId } = body;
    if (!inviteId || typeof inviteId !== "string") {
      return jsonError("BAD_REQUEST", "inviteId is required", 400);
    }

    const prisma = getPrisma();

    // Verify invite belongs to this supplier
    const invite = await prisma.supplierInvite.findUnique({
      where: { id: inviteId },
      select: { supplierId: true, status: true },
    });

    if (!invite) {
      return jsonError("NOT_FOUND", "Invite not found", 404);
    }

    if (invite.supplierId !== membership.supplierId) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    if (invite.status !== "PENDING") {
      return jsonError("BAD_REQUEST", "Only pending invites can be revoked", 400);
    }

    // Revoke invite
    await prisma.supplierInvite.update({
      where: { id: inviteId },
      data: { status: "REVOKED" },
    });

    return NextResponse.json({ ok: true });
  });
}

