import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { verifyAuthToken, getAuthCookieName } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/buyer/suppliers/conversations/by-id/[conversationId]/messages/[messageId]
 * Soft delete a message for the buyer (sets deletedForBuyerAt)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
) {
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

    const { conversationId, messageId } = await context.params;

    const prisma = getPrisma();

    // Load user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!dbUser || dbUser.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Verify conversation belongs to this buyer
    const conversation = await prisma.supplierConversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true },
    });

    if (!conversation) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    if (conversation.buyerId !== dbUser.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Verify message belongs to this conversation
    const message = await prisma.supplierMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true, deletedForBuyerAt: true },
    });

    if (!message) {
      return jsonError("NOT_FOUND", "Message not found", 404);
    }

    if (message.conversationId !== conversationId) {
      return jsonError("FORBIDDEN", "Message does not belong to this conversation", 403);
    }

    // If already deleted, return success (idempotent)
    if (message.deletedForBuyerAt) {
      return NextResponse.json({ ok: true });
    }

    // Soft delete for buyer
    await prisma.supplierMessage.update({
      where: { id: messageId },
      data: {
        deletedForBuyerAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  });
}




