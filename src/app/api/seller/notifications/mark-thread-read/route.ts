import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/seller/notifications/mark-thread-read
 * Mark MESSAGE_RECEIVED notifications as read for a specific conversation
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

    const prisma = getPrisma();

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
      user.id,
      conversationId
    );

    return NextResponse.json({
      ok: true,
      updated: Number(result),
    });
  });
}

