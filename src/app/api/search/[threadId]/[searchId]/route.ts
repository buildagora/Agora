/**
 * GET /api/search/[threadId]/[searchId]
 *
 * Loads a previously-run search. Returns 404 if not found OR not owned by
 * the caller (we don't leak existence).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { readAnonymousId } from "@/lib/chat/anonId.server";
import { loadThread } from "@/lib/chat/threads.server";
import { loadSearch } from "@/lib/search/runSearch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ threadId: string; searchId: string }> }
) {
  const { threadId, searchId } = await context.params;
  if (!threadId || !searchId) {
    return NextResponse.json(
      { ok: false, code: "MISSING_PARAMS", message: "threadId and searchId required" },
      { status: 400 }
    );
  }

  const user = await getCurrentUserFromRequest(req);
  const anonymousId = user ? null : readAnonymousId(req);
  if (!user && !anonymousId) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_NOT_FOUND", message: "Search not found" },
      { status: 404 }
    );
  }
  const owner = user ? { userId: user.id } : { anonymousId: anonymousId! };

  // Ownership: verify the caller owns the thread that contains this search.
  const thread = await loadThread(threadId, owner);
  if (!thread) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_NOT_FOUND", message: "Search not found" },
      { status: 404 }
    );
  }

  const search = await loadSearch({ threadId, searchId });
  if (!search) {
    return NextResponse.json(
      { ok: false, code: "SEARCH_NOT_FOUND", message: "Search not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, search }, { status: 200 });
}
