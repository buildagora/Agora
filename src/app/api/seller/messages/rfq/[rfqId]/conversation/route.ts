/**
 * GET /api/seller/messages/rfq/[rfqId]/conversation
 * Find or create RFQ-scoped conversation for seller
 * 
 * Returns the conversation ID for the given RFQ, buyer, and supplier org.
 * Creates the conversation if it doesn't exist.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rfqId: string }> }
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

    const { rfqId } = await context.params;

    const prisma = getPrisma();

    // Verify RFQ exists and seller has access to it
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, buyerId: true, status: true },
    });

    if (!rfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Get seller's supplierId via SupplierMember
    const membership = await prisma.supplierMember.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      select: { supplierId: true },
    });

    if (!membership) {
      return jsonError("BAD_REQUEST", "Your supplier account is pending verification or not linked. Please contact support.", 400);
    }

    const supplierId = membership.supplierId;

    // Find or create RFQ-scoped conversation
    let conversation = await prisma.supplierConversation.findUnique({
      where: {
        buyerId_supplierId_rfqId: {
          buyerId: rfq.buyerId,
          supplierId: supplierId,
          rfqId: rfqId,
        },
      },
      include: {
        buyer: {
          select: { id: true, fullName: true, companyName: true, email: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!conversation) {
      // Create new RFQ-scoped conversation
      conversation = await prisma.supplierConversation.create({
        data: {
          buyerId: rfq.buyerId,
          supplierId: supplierId,
          rfqId: rfqId,
        },
        include: {
          buyer: {
            select: { id: true, fullName: true, companyName: true, email: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
    }

    const buyerName = conversation.buyer.companyName || conversation.buyer.fullName || conversation.buyer.email || "Buyer";
    const lastMessage = conversation.messages[0];

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      buyerId: conversation.buyerId,
      buyerName: buyerName,
      lastMessagePreview: lastMessage
        ? lastMessage.body.substring(0, 50) + (lastMessage.body.length > 50 ? "..." : "")
        : null,
      lastMessageAt: lastMessage
        ? lastMessage.createdAt.toISOString()
        : conversation.updatedAt.toISOString(),
    });
  });
}

