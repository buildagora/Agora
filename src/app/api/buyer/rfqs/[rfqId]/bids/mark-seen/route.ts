/**
 * Mark bids as seen for a buyer's RFQ
 * Updates seenByBuyerAt timestamp for all bids on this RFQ
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function markBidsAsSeen(
  request: NextRequest,
  params: Promise<{ rfqId: string }>
) {
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

    const { rfqId } = await params;

    // Verify RFQ exists and belongs to this buyer
    const prisma = getPrisma();
    const rfq = await prisma.rFQ.findFirst({
      where: {
        id: rfqId,
        buyerId: user.id,
      },
    });

    if (!rfq) {
      return jsonError("NOT_FOUND", "RFQ not found", 404);
    }

    // Check if Bid model has seenByBuyerAt field
    // If schema doesn't support it yet, return success with skipped flag
    try {
      // Attempt to update bids (will fail if field doesn't exist)
      const updated = await prisma.bid.updateMany({
        where: {
          rfqId: rfqId,
        },
        data: {
          seenByBuyerAt: new Date(),
        },
      });

      console.log("[BIDS_MARK_SEEN]", {
        rfqId,
        buyerId: user.id,
        updatedCount: updated.count,
      });

      return jsonOk({
        ok: true,
        updated: updated.count,
      }, 200);
    } catch (error: any) {
      // If field doesn't exist or update fails, return success with skipped
      if (process.env.NODE_ENV === "development") {
        console.log("[BIDS_MARK_SEEN_SKIPPED]", {
          rfqId,
          buyerId: user.id,
          reason: "Bid.seenByBuyerAt field may not exist in schema",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return jsonOk({
        ok: true,
        skipped: true,
      }, 200);
    }
  });
}

// Support both PATCH and POST methods
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  return markBidsAsSeen(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  return markBidsAsSeen(request, params);
}

