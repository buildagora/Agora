import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/notifications/unread-count
 * Get count of unread notifications for the logged-in buyer
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    // Auth check
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!dbUser) {
      return jsonError("UNAUTHORIZED", "User not found", 401);
    }

    if (dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Count unread MESSAGE_RECEIVED notifications
    const unread = await prisma.notification.count({
      where: {
        userId: dbUser.id,
        type: "MESSAGE_RECEIVED",
        readAt: null,
      },
    });

    return NextResponse.json({
      ok: true,
      unread,
    });
  });
}

