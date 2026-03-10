import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/rfqs/unread-activity-count
 * Get count of unique RFQs with unread bid activity for the logged-in buyer
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const prisma = getPrisma();

    // Count distinct RFQs that have unread BID_RECEIVED notifications
    const unreadBidNotifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: "BID_RECEIVED",
        readAt: null,
        rfqId: { not: null },
      },
      select: {
        rfqId: true,
      },
      distinct: ["rfqId"],
    });

    // Count unique RFQs with unread activity
    const uniqueRfqCount = unreadBidNotifications.filter(n => n.rfqId !== null).length;

    return NextResponse.json({
      ok: true,
      count: uniqueRfqCount,
    });
  });
}

