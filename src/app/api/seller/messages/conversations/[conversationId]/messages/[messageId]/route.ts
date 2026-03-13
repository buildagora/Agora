import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/seller/messages/conversations/[conversationId]/messages/[messageId]
 * Soft delete a message for the seller (sets deletedForSupplierAt)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
) {
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

    const { conversationId, messageId } = await context.params;

    const prisma = getPrisma();
    
    // Get seller's supplierId via SupplierMember
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true },
    });

    if (!dbUser || dbUser.role !== "SELLER") {
      return jsonError("FORBIDDEN", "Seller access required", 403);
    }

    // Find ACTIVE supplier membership
    const membership = await prisma.supplierMember.findFirst({
      where: {
        userId: dbUser.id,
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    if (!membership) {
      return jsonError("BAD_REQUEST", "Your supplier account is pending verification or not linked. Please contact support.", 400);
    }

    const supplierId = membership.supplierId;

    // Verify conversation belongs to this supplier
    const conversation = await prisma.supplierConversation.findUnique({
      where: { id: conversationId },
      select: { supplierId: true },
    });

    if (!conversation) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    if (conversation.supplierId !== supplierId) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Verify message belongs to this conversation
    const message = await prisma.supplierMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true, deletedForSupplierAt: true },
    });

    if (!message) {
      return jsonError("NOT_FOUND", "Message not found", 404);
    }

    if (message.conversationId !== conversationId) {
      return jsonError("FORBIDDEN", "Message does not belong to this conversation", 403);
    }

    // If already deleted, return success (idempotent)
    if (message.deletedForSupplierAt) {
      return NextResponse.json({ ok: true });
    }

    // Soft delete for seller
    await prisma.supplierMessage.update({
      where: { id: messageId },
      data: {
        deletedForSupplierAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  });
}

