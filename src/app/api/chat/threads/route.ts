/**
 * GET /api/chat/threads
 *
 * Returns the caller's chat threads (newest first, max 50). Identity is the
 * logged-in user if present, otherwise the anonymous cookie ID.
 *
 * Response 200:
 *   { ok: true, threads: ChatThreadSummary[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { readAnonymousId } from "@/lib/chat/anonId.server";
import { listThreads } from "@/lib/chat/threads.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  const anonymousId = user ? null : readAnonymousId(req);

  if (!user && !anonymousId) {
    return NextResponse.json({ ok: true, threads: [] }, { status: 200 });
  }

  const threads = await listThreads(
    user ? { userId: user.id } : { anonymousId: anonymousId! }
  );
  return NextResponse.json({ ok: true, threads }, { status: 200 });
}
