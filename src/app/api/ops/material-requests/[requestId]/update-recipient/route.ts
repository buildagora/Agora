/**
 * POST /api/ops/material-requests/[requestId]/update-recipient
 * Internal: manually update a material request recipient status (and optional notes).
 * No auth yet — use only in trusted / local environments.
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set(["REPLIED", "OUT_OF_STOCK", "NO_RESPONSE", "VIEWED"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  return withErrorHandling(async () => {
    requireServerEnv();

    const { requestId } = await context.params;
    if (!requestId?.trim()) {
      return jsonError("BAD_REQUEST", "requestId is required", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError("BAD_REQUEST", "Invalid request body", 400);
    }

    const b = body as Record<string, unknown>;
    const supplierId = b.supplierId;
    const status = b.status;
    const notes = b.notes;

    if (typeof supplierId !== "string" || !supplierId.trim()) {
      return jsonError("BAD_REQUEST", "supplierId is required", 400);
    }

    if (typeof status !== "string" || !ALLOWED_STATUS.has(status)) {
      return jsonError(
        "BAD_REQUEST",
        "status must be one of: REPLIED, OUT_OF_STOCK, NO_RESPONSE, VIEWED",
        400
      );
    }

    let notesValue: string | null | undefined;
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== "string") {
        return jsonError("BAD_REQUEST", "notes must be a string", 400);
      }
      const trimmed = notes.trim();
      notesValue = trimmed.length > 0 ? trimmed : null;
    }

    const prisma = getPrisma();
    const now = new Date();

    const updateData: {
      status: string;
      statusUpdatedAt: Date;
      operatorNotes?: string | null;
      viewedAt?: Date;
      respondedAt?: Date;
    } = {
      status,
      statusUpdatedAt: now,
    };

    if (notesValue !== undefined) {
      updateData.operatorNotes = notesValue;
    }

    if (status === "VIEWED") {
      updateData.viewedAt = now;
    }
    if (status === "REPLIED") {
      updateData.respondedAt = now;
    }

    try {
      const updated = await prisma.materialRequestRecipient.update({
        where: {
          materialRequestId_supplierId: {
            materialRequestId: requestId.trim(),
            supplierId: supplierId.trim(),
          },
        },
        data: updateData,
        select: {
          id: true,
          materialRequestId: true,
          supplierId: true,
          status: true,
          statusUpdatedAt: true,
          viewedAt: true,
          respondedAt: true,
          operatorNotes: true,
        },
      });

      return jsonOk(
        {
          updated: true,
          recipient: {
            ...updated,
            statusUpdatedAt: updated.statusUpdatedAt.toISOString(),
            viewedAt: updated.viewedAt?.toISOString() ?? null,
            respondedAt: updated.respondedAt?.toISOString() ?? null,
          },
        },
        200
      );
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "P2025") {
        return jsonError("NOT_FOUND", "Recipient not found for this request and supplier", 404);
      }
      throw e;
    }
  });
}
