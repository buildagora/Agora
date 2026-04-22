/**
 * POST /api/ops/material-requests/[requestId]/update-status
 * Body: { opsStatus: "NEW" | "IN_PROGRESS" | "COMPLETED" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";
import { withErrorHandling, jsonError } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["NEW", "IN_PROGRESS", "COMPLETED"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  return withErrorHandling(async () => {
    const { requestId } = await params;
    if (!requestId?.trim()) {
      return jsonError("BAD_REQUEST", "requestId required", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const opsStatus =
      typeof body === "object" &&
      body !== null &&
      "opsStatus" in body &&
      typeof (body as { opsStatus: unknown }).opsStatus === "string"
        ? (body as { opsStatus: string }).opsStatus.trim()
        : "";

    if (!ALLOWED.has(opsStatus)) {
      return jsonError(
        "BAD_REQUEST",
        "opsStatus must be NEW, IN_PROGRESS, or COMPLETED",
        400
      );
    }

    const prisma = getPrisma();
    const now = new Date();

    const result = await prisma.materialRequest.updateMany({
      where: { id: requestId.trim() },
      data: {
        opsStatus,
        opsUpdatedAt: now,
      },
    });

    if (result.count === 0) {
      return jsonError("NOT_FOUND", "Material request not found", 404);
    }

    return NextResponse.json({ ok: true });
  });
}
