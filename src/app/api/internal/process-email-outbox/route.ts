import { type NextRequest, NextResponse } from "next/server";
import { processEmailOutbox } from "@/lib/emailOutboxWorker.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel production deployment (not preview / dev). */
function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** At least one shared secret is configured for this route. */
function hasOutboxAuthSecret(): boolean {
  return !!(
    process.env.INTERNAL_EMAIL_OUTBOX_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim()
  );
}

/**
 * Validates Authorization: Bearer <secret>.
 * Accepts INTERNAL_EMAIL_OUTBOX_SECRET (manual / integrations) or CRON_SECRET
 * (Vercel Cron sends Bearer CRON_SECRET when CRON_SECRET is set in project env).
 */
function bearerTokenMatches(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  const internal = process.env.INTERNAL_EMAIL_OUTBOX_SECRET?.trim();
  const cron = process.env.CRON_SECRET?.trim();
  if (internal && token === internal) return true;
  if (cron && token === cron) return true;
  return false;
}

/**
 * Production: require configured secret(s) and a valid Bearer.
 * Non-production: if any secret is set, require Bearer; if none set, allow (local dev).
 */
function authorizeOutboxRequest(request: NextRequest): NextResponse | null {
  if (isVercelProduction() && !hasOutboxAuthSecret()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing INTERNAL_EMAIL_OUTBOX_SECRET or CRON_SECRET in production (fail closed)",
      },
      { status: 503 }
    );
  }

  if (hasOutboxAuthSecret() && !bearerTokenMatches(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

async function runOutbox(request: NextRequest): Promise<NextResponse> {
  const authError = authorizeOutboxRequest(request);
  if (authError) return authError;

  const processed = await processEmailOutbox();
  return NextResponse.json({ ok: true, processed });
}

/**
 * GET — Vercel Cron invokes scheduled paths with GET + Authorization: Bearer CRON_SECRET.
 * POST — manual / scripted runs; use Bearer INTERNAL_EMAIL_OUTBOX_SECRET (or same value as CRON_SECRET).
 */
export async function GET(request: NextRequest) {
  return runOutbox(request);
}

export async function POST(request: NextRequest) {
  return runOutbox(request);
}
