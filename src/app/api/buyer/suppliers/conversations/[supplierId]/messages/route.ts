import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";
import { sendBuyerMessageToSupplier } from "@/lib/supplierMessaging/sendBuyerMessageToSupplier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEV VERIFICATION CHECKLIST:
 * 
 * ✅ Buyer sends message -> seller gets email + Notification row created for SELLER user(s)
 * ✅ Seller sends message -> buyer gets email + Notification row created
 * ✅ Conversations list shows unreadCount badge until the thread is opened, then mark-thread-read clears it
 * ✅ GROUP CHAT: When buyer sends message, notifications created for ALL active SupplierMembers
 * 
 * To verify:
 * 1. Send buyer->supplier message, check Notification table for seller user
 * 2. Send supplier->buyer message, check Notification table for buyer user
 * 3. Check conversations list shows unread badges
 * 4. Open thread, verify badge clears (mark-thread-read called)
 * 5. GROUP CHAT TEST:
 *    - Create supplier org with multiple team members (admin + 2 members)
 *    - Buyer sends message to supplier conversation
 *    - Verify Notification rows created for ALL 3 active SupplierMembers
 *    - All members should see unread badge in UI
 */

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ supplierId: string }> }
) {
  return withErrorHandling(async () => {
    // Read auth cookie
    const cookieName = getAuthCookieName();
    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Verify JWT token
    const payload = await verifyAuthToken(token);
    if (!payload) {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Load user from database
    const prisma = getPrisma();
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, fullName: true, companyName: true },
    });

    if (!dbUser) {
      return jsonError("UNAUTHORIZED", "User not found", 401);
    }

    if (dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    const { supplierId } = await context.params;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const { body: messageBody } = body;
    if (!messageBody || typeof messageBody !== "string" || !messageBody.trim()) {
      return jsonError("BAD_REQUEST", "Message body is required", 400);
    }

    // Use reusable helper to send message and handle notifications
    await sendBuyerMessageToSupplier({
      prisma,
      buyer: {
        id: dbUser.id,
        fullName: dbUser.fullName,
        companyName: dbUser.companyName,
      },
      supplierId,
      messageBody: messageBody.trim(),
    });

    return NextResponse.json({ ok: true });
  });
}

