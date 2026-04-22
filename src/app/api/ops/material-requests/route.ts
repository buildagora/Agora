/**
 * GET /api/ops/material-requests
 *
 * Lists all material requests with recipient counts. Response matches
 * GET /api/buyer/material-requests (`{ ok, data }` and per-row `counts`).
 * Adds opsStatus, emailStatus (latest EmailEvent for operator mail, rfqId = request id).
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

    const requestIds = requests.map((r) => r.id);
    const emailEvents =
      requestIds.length === 0
        ? []
        : await prisma.emailEvent.findMany({
            where: { rfqId: { in: requestIds } },
            orderBy: { createdAt: "desc" },
            select: { rfqId: true, status: true },
          });

    /** Latest EmailEvent status per material request id (rfqId). */
    const emailStatusByRequestId = new Map<string, string>();
    for (const ev of emailEvents) {
      if (ev.rfqId && !emailStatusByRequestId.has(ev.rfqId)) {
        emailStatusByRequestId.set(ev.rfqId, ev.status);
      }
    }

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

      const emailStatus = emailStatusByRequestId.get(req.id) ?? null;

      return {
        id: req.id,
        categoryId: req.categoryId,
        requestText: req.requestText,
        sendMode: req.sendMode,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        updatedAt: req.updatedAt.toISOString(),
        opsStatus: req.opsStatus,
        emailStatus,
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
