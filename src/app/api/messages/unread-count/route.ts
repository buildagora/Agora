import { NextRequest } from "next/server";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/messages/unread-count
 * Returns total unread message count for the authenticated user
 *
 * Unread rules (per Prisma schema):
 * - BUYER: buyerId=user.id AND seenByBuyerAt IS NULL
 * - SELLER: sellerId=user.id AND seenBySellerAt IS NULL
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const user = await requireCurrentUserFromRequest(request);
    const prisma = getPrisma();

    let count = 0;

    if (user.role === "BUYER") {
      count = await prisma.message.count({
        where: {
          buyerId: user.id,
          seenByBuyerAt: null,
        },
      });
    } else if (user.role === "SELLER") {
      count = await prisma.message.count({
        where: {
          sellerId: user.id,
          seenBySellerAt: null,
        },
      });
    } else {
      // Unknown role (future-proof)
      return jsonError("FORBIDDEN", "Unsupported role", 403);
    }

    return jsonOk({ count });
  });
}
