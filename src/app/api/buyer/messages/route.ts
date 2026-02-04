/**
 * Buyer Messages API
 * Returns all message threads for the authenticated buyer
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

    if (user.role !== "BUYER") {
      return jsonError("FORBIDDEN", "Buyer access required", 403);
    }

    // Query messages from database
    const prisma = getPrisma();
    const dbMessages = await prisma.message.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Parse JSON fields and return
    const messages = dbMessages.map(msg => ({
      id: msg.id,
      rfqId: msg.rfqId,
      threadId: msg.threadId,
      buyerId: msg.buyerId,
      sellerId: msg.sellerId,
      fromRole: msg.fromRole,
      fromName: msg.fromName,
      senderId: msg.senderId,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
      metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
      seenByBuyerAt: msg.seenByBuyerAt?.toISOString() || null,
      seenBySellerAt: msg.seenBySellerAt?.toISOString() || null,
    }));

    return jsonOk(messages, 200);
  });
}


