/**
 * Seller Notifications API
 * Returns all notifications for the authenticated seller
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

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
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

    if (user.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    const body = await request.json().catch(() => ({}));
    const { markRead, notificationIds } = body;

    if (markRead !== true) {
      return jsonError("BAD_REQUEST", "markRead=true required", 400);
    }

    // Update notifications in database
    const prisma = getPrisma();
    const now = new Date();
    
    const where: any = {
      userId: user.id,
      readAt: null, // Only update unread notifications
    };

    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      where.id = { in: notificationIds };
    }

    await prisma.notification.updateMany({
      where,
      data: {
        readAt: now,
      },
    });

    return jsonOk({ success: true }, 200);
  });
}

