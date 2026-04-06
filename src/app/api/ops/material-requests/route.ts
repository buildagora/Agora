/**
 * GET /api/ops/material-requests
 *
 * Lists all material requests with recipient counts. Response matches
 * GET /api/buyer/material-requests (`{ ok, data }` and per-row `counts`).
 * No auth yet — local / trusted use only (same posture as other ops routes).
 */

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { withErrorHandling } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withErrorHandling(async () => {
    const prisma = getPrisma();

    const requests = await prisma.materialRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        recipients: {
          select: { status: true },
        },
      },
    });

    const data = requests.map((req) => {
      const recipients = req.recipients;
      const totalRecipients = recipients.length;
      const repliedCount = recipients.filter((r) => r.status === "REPLIED").length;
      const pendingCount = recipients.filter(
        (r) => r.status === "SENT" || r.status === "VIEWED"
      ).length;
      const declinedCount = recipients.filter(
        (r) =>
          r.status === "DECLINED" ||
          r.status === "OUT_OF_STOCK" ||
          r.status === "NO_RESPONSE"
      ).length;

      return {
        id: req.id,
        categoryId: req.categoryId,
        requestText: req.requestText,
        sendMode: req.sendMode,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        updatedAt: req.updatedAt.toISOString(),
        counts: {
          totalRecipients,
          repliedCount,
          pendingCount,
          declinedCount,
        },
      };
    });

    return NextResponse.json({ ok: true, data });
  });
}
