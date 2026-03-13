import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seller/messages/conversations/[conversationId]
 * Get messages for a specific conversation
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
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

    const { conversationId } = await context.params;

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

    const supplier = { id: membership.supplierId };

    // Verify conversation belongs to this supplier
    const conversation = await prisma.supplierConversation.findUnique({
      where: { id: conversationId },
      select: { supplierId: true, hiddenForSupplierAt: true },
    });

    if (!conversation) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    if (conversation.supplierId !== supplier.id) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // Check if conversation is hidden for seller
    if (conversation.hiddenForSupplierAt) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    // Load messages (only those not deleted for seller)
    const messages = await prisma.supplierMessage.findMany({
      where: {
        conversationId: conversationId,
        deletedForSupplierAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Format messages
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderType: msg.senderType as "BUYER" | "SUPPLIER" | "AGORA",
      senderDisplayName: msg.senderDisplayName,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      messages: formattedMessages,
    });
  });
}

/**
 * DELETE /api/seller/messages/conversations/[conversationId]
 * Soft delete (hide) a conversation for the seller
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
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

    const { conversationId } = await context.params;

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
      select: { supplierId: true, hiddenForSupplierAt: true },
    });

    if (!conversation) {
      return jsonError("NOT_FOUND", "Conversation not found", 404);
    }

    if (conversation.supplierId !== supplierId) {
      return jsonError("FORBIDDEN", "Access denied", 403);
    }

    // If already hidden, return success (idempotent)
    if (conversation.hiddenForSupplierAt) {
      return NextResponse.json({ ok: true });
    }

    // Soft delete (hide) for seller
    await prisma.supplierConversation.update({
      where: { id: conversationId },
      data: {
        hiddenForSupplierAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  });
}

