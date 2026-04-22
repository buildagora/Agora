import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { processEmailOutbox } from "@/lib/emailOutboxWorker.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/process-email-outbox
 * Processes due OUTBOX EmailEvent rows (cron / manual trigger).
 *
 * Optional: set INTERNAL_EMAIL_OUTBOX_SECRET and send Authorization: Bearer <secret>.
 */
export async function POST() {
  const secret = process.env.INTERNAL_EMAIL_OUTBOX_SECRET;
  if (secret) {
    const auth = (await headers()).get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const processed = await processEmailOutbox();
  return NextResponse.json({ ok: true, processed });
}
