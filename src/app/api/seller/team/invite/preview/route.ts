import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/team/invite/preview
 * Preview invite details (supplier name, email hint) without authentication
 * Public endpoint
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token || typeof token !== "string" || !token.trim()) {
      return jsonError("BAD_REQUEST", "Token is required", 400);
    }

    // Hash token to find invite
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

    // Return preview info (include email for signup form)
    return NextResponse.json({
      ok: true,
      supplierName: invite.supplier.name,
      email: invite.email || null,
      emailHint: invite.email ? invite.email.split("@")[0] + "@***" : null,
    });
  });
}

