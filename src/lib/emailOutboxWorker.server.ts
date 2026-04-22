import "server-only";
import { getPrisma } from "@/lib/db.server";
import { sendEmail } from "@/lib/email.server";
import {
  OPERATOR_MATERIAL_REQUEST_SUBJECT,
  buildOperatorMaterialRequestEmailPayload,
} from "@/lib/operatorMaterialRequestEmail.server";

function safeErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Milliseconds after a failed send before the next attempt (by attempt number after increment). */
function msUntilNextRetryAfterFailure(attemptCountAfterFailedSend: number): number | null {
  switch (attemptCountAfterFailedSend) {
    case 1:
      return 10_000;
    case 2:
      return 30_000;
    case 3:
      return 120_000;
    case 4:
      return 600_000;
    default:
      return null;
  }
}

async function buildPayloadForOutboxEvent(event: {
  id: string;
  subject: string;
  rfqId: string | null;
}): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  if (event.subject !== OPERATOR_MATERIAL_REQUEST_SUBJECT || !event.rfqId) {
    console.error("[EMAIL_OUTBOX_PROCESSING]", {
      emailEventId: event.id,
      error: "unsupported_outbox_email_type",
      subject: event.subject,
    });
    return null;
  }

  const prisma = getPrisma();
  const mr = await prisma.materialRequest.findUnique({
    where: { id: event.rfqId },
    include: {
      buyer: { select: { fullName: true, companyName: true } },
    },
  });

  if (!mr) {
    console.error("[EMAIL_OUTBOX_PROCESSING]", {
      emailEventId: event.id,
      rfqId: event.rfqId,
      error: "material_request_not_found",
    });
    return null;
  }

  const buyerDisplayName =
    mr.buyer.fullName?.trim() || mr.buyer.companyName?.trim() || "—";

  return buildOperatorMaterialRequestEmailPayload({
    materialRequestId: mr.id,
    categoryId: mr.categoryId,
    requestText: mr.requestText,
    buyerDisplayName,
    submittedAtIso: mr.createdAt.toISOString(),
  });
}

/**
 * Process up to 10 due OUTBOX email events (retry with backoff).
 * Never throws — logs failures per item.
 */
export async function processEmailOutbox(): Promise<number> {
  const prisma = getPrisma();
  const now = new Date();

  const batch = await prisma.emailEvent.findMany({
    where: {
      status: "OUTBOX",
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: 10,
  });

  if (batch.length === 0) {
    return 0;
  }

  console.log("[EMAIL_OUTBOX_PROCESSING]", { count: batch.length });

  let processed = 0;

  for (const event of batch) {
    processed++;
    const nowAttempt = new Date();

    let attemptCount = 0;
    try {
      const bumped = await prisma.emailEvent.update({
        where: { id: event.id },
        data: {
          attemptCount: { increment: 1 },
          lastAttemptAt: nowAttempt,
        },
        select: { attemptCount: true },
      });
      attemptCount = bumped.attemptCount;
    } catch (e) {
      console.error("[EMAIL_OUTBOX_PROCESSING]", {
        emailEventId: event.id,
        error: safeErrorMessage(e),
        phase: "increment_attempt",
      });
      continue;
    }

    const payload = await buildPayloadForOutboxEvent(event);
    if (!payload) {
      try {
        await prisma.emailEvent.update({
          where: { id: event.id },
          data: {
            status: "FAILED",
            error: "Could not build email payload for outbox item",
          },
        });
      } catch (e) {
        console.error("[EMAIL_FAILED_FINAL]", {
          emailEventId: event.id,
          error: safeErrorMessage(e),
        });
      }
      console.error("[EMAIL_FAILED_FINAL]", {
        emailEventId: event.id,
        attemptCount,
        reason: "payload_build_failed",
      });
      continue;
    }

    try {
      const { id: providerMessageId } = await sendEmail(payload);
      await prisma.emailEvent.update({
        where: { id: event.id },
        data: {
          status: "SENT",
          providerMessageId,
          error: null,
        },
      });
      console.log("[EMAIL_SENT]", {
        emailEventId: event.id,
        providerMessageId,
        attemptCount,
      });
    } catch (sendErr) {
      const errorMessage = safeErrorMessage(sendErr);

      if (attemptCount >= 5) {
        try {
          await prisma.emailEvent.update({
            where: { id: event.id },
            data: {
              status: "FAILED",
              error: errorMessage,
            },
          });
        } catch (e) {
          console.error("[EMAIL_FAILED_FINAL]", {
            emailEventId: event.id,
            error: safeErrorMessage(e),
          });
        }
        console.error("[EMAIL_FAILED_FINAL]", {
          emailEventId: event.id,
          attemptCount,
          error: errorMessage,
        });
        continue;
      }

      const delayMs = msUntilNextRetryAfterFailure(attemptCount);
      const nextAt =
        delayMs != null
          ? new Date(nowAttempt.getTime() + delayMs)
          : new Date(nowAttempt.getTime() + 10_000);

      try {
        await prisma.emailEvent.update({
          where: { id: event.id },
          data: {
            status: "OUTBOX",
            nextAttemptAt: nextAt,
            error: errorMessage,
          },
        });
      } catch (e) {
        console.error("[EMAIL_RETRY]", {
          emailEventId: event.id,
          error: safeErrorMessage(e),
          phase: "schedule_retry_update",
        });
        continue;
      }

      console.error("[EMAIL_RETRY]", {
        emailEventId: event.id,
        attemptCount,
        nextAttemptAt: nextAt.toISOString(),
        delayMs,
        error: errorMessage,
      });
    }
  }

  return processed;
}
