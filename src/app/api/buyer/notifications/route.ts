/**
 * Buyer Notifications API
 * Returns all notifications for the authenticated buyer
 * 
 * DEV TEST:
 * curl http://127.0.0.1:3000/api/buyer/notifications \
 *   -H "x-dev-user-id: <buyer_user_id>"
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Query notifications from database
    const prisma = getPrisma();
    const dbNotifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Parse JSON fields and return
    const notifications = dbNotifications.map(notif => ({
      id: notif.id,
      userId: notif.userId,
      rfqId: notif.rfqId,
      type: notif.type,
      createdAt: notif.createdAt.toISOString(),
      readAt: notif.readAt?.toISOString() || null,
      data: notif.data ? JSON.parse(notif.data) : {},
    }));

    return jsonOk(notifications, 200);
  });
}

export async function PATCH(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const body = await request.json().catch(() => ({}));
    const { rfqId, markRead } = body;

    if (!rfqId || markRead !== true) {
      return jsonError("BAD_REQUEST", "rfqId and markRead=true required", 400);
    }

    // Update notifications in database
    const prisma = getPrisma();
    const now = new Date();
    
    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        rfqId: rfqId,
        readAt: null, // Only update unread notifications
      },
      data: {
        readAt: now,
      },
    });

    return jsonOk({ success: true }, 200);
  });
}
