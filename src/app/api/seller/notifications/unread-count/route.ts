import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/notifications/unread-count
 * Get count of unread MESSAGE_RECEIVED notifications for the logged-in seller
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

    const prisma = getPrisma();
    
    // Count unread MESSAGE_RECEIVED notifications
    const unread = await prisma.notification.count({
      where: {
        userId: user.id,
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

