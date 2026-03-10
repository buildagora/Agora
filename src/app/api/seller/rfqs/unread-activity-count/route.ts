import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/rfqs/unread-activity-count
 * Get counts of unread RFQ activity for the logged-in seller
 * Returns separate counts for broadcast and direct RFQs
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
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

    // Get all unread RFQ_CREATED notifications for this seller
    const unreadNotifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: "RFQ_CREATED",
        readAt: null,
        rfqId: { not: null },
      },
      select: {
        rfqId: true,
        data: true,
      },
    });

    // Extract unique RFQ IDs
    const uniqueRfqIds = [...new Set(unreadNotifications.map(n => n.rfqId).filter((id): id is string => Boolean(id)))];

    if (uniqueRfqIds.length === 0) {
      return NextResponse.json({
        ok: true,
        broadcast: 0,
        direct: 0,
        total: 0,
      });
    }

    // Batch fetch RFQ visibility in one query
    const rfqs = await prisma.rFQ.findMany({
      where: {
        id: { in: uniqueRfqIds },
      },
      select: {
        id: true,
        visibility: true,
      },
    });

    // Build visibility map
    const visibilityMap = new Map<string, string | null>();
    for (const rfq of rfqs) {
      visibilityMap.set(rfq.id, rfq.visibility);
    }

    // Count by visibility
    let broadcastCount = 0;
    let directCount = 0;

    for (const rfqId of uniqueRfqIds) {
      const visibility = visibilityMap.get(rfqId);
      if (visibility === "direct") {
        directCount++;
      } else {
        // Default to broadcast if visibility is null or "broadcast"
        broadcastCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      broadcast: broadcastCount,
      direct: directCount,
      total: broadcastCount + directCount,
    });
  });
}

