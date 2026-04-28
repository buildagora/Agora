/**
 * Inbound-SMS routing.
 *
 * Given a normalized E.164 phone number, find the conversation the buyer
 * most likely meant to reply to: their most-recently-updated SupplierConversation
 * tied to an OPEN MaterialRequest where `buyerPhone` matches.
 *
 * v1 heuristic: in practice the buyer texts back within minutes of receiving
 * the supplier's outbound SMS, so the freshly-bumped conversation is
 * overwhelmingly correct. If the buyer is juggling multiple suppliers we
 * still pick newest — log it and revisit if real-world volume forces
 * per-conversation phone numbers.
 */

import "server-only";
import { getPrisma } from "@/lib/db.server";

export type InboundRoute = {
  conversationId: string;
  materialRequestId: string;
  supplierId: string;
  buyerId: string;
  buyerName: string | null;
  /** Total open conversations for this phone — > 1 means we picked the newest. */
  candidateCount: number;
};

export async function findActiveConversationForBuyerPhone(
  e164Phone: string
): Promise<InboundRoute | null> {
  const prisma = getPrisma();

  const conversations = await prisma.supplierConversation.findMany({
    where: {
      materialRequest: {
        buyerPhone: e164Phone,
        status: "OPEN",
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      supplierId: true,
      buyerId: true,
      materialRequestId: true,
      materialRequest: { select: { buyerName: true } },
    },
    take: 5, // small upper bound so candidateCount is meaningful
  });

  if (conversations.length === 0) return null;

  const top = conversations[0];
  if (!top.materialRequestId) return null; // safety: skip rfq-only convos

  return {
    conversationId: top.id,
    materialRequestId: top.materialRequestId,
    supplierId: top.supplierId,
    buyerId: top.buyerId,
    buyerName: top.materialRequest?.buyerName ?? null,
    candidateCount: conversations.length,
  };
}
