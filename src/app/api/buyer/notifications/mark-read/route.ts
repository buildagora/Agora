import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/notifications/mark-read
 * Mark notifications as read for a given urlPath or conversationId
 */
export async function POST(request: NextRequest) {
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

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { conversationId, urlPath } = body;

    if (!conversationId && !urlPath) {
      return jsonError("BAD_REQUEST", "conversationId or urlPath is required", 400);
    }

    // Build where clause to match notifications
    const where: any = {
      userId: dbUser.id,
      readAt: null,
      type: "MESSAGE_RECEIVED",
    };

    if (conversationId) {
      // Match notifications where data JSON contains the conversationId
      where.data = {
        contains: conversationId,
      };
    } else if (urlPath) {
      // Match notifications where data JSON contains the urlPath
      where.data = {
        contains: urlPath,
      };
    }

    // Mark matching notifications as read
    const result = await prisma.notification.updateMany({
      where,
      data: {
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      updated: result.count,
    });
  });
}



