import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/notifications/mark-thread-read
 * Mark MESSAGE_RECEIVED notifications as read for a specific conversation
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

    const { conversationId } = body;

    if (!conversationId || typeof conversationId !== "string") {
      return jsonError("BAD_REQUEST", "conversationId is required", 400);
    }

    // Mark notifications as read using raw SQL (data is stored as JSON string)
    const result = await prisma.$executeRawUnsafe(
      `
      UPDATE "Notification"
      SET "readAt" = NOW()
      WHERE "userId" = $1
        AND type = 'MESSAGE_RECEIVED'
        AND "readAt" IS NULL
        AND (data::jsonb->>'conversationId') = $2
      `,
      dbUser.id,
      conversationId
    );

    return NextResponse.json({
      ok: true,
      updated: Number(result),
    });
  });
}



