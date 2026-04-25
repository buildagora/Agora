/**
 * GET /api/chat/threads/[id]
 *
 * Loads a single thread's full message history. Returns 404 if the thread
 * doesn't exist OR isn't owned by the caller (we don't leak existence).
 *
 * Response 200: { ok: true, thread: ChatThreadDetail }
 * Response 404: { ok: false, code: "THREAD_NOT_FOUND" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { readAnonymousId } from "@/lib/chat/anonId.server";
import { loadThread } from "@/lib/chat/threads.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, code: "MISSING_ID", message: "Thread id required" },
      { status: 400 }
    );
  }

  const user = await getCurrentUserFromRequest(req);
  const anonymousId = user ? null : readAnonymousId(req);

  if (!user && !anonymousId) {
    return NextResponse.json(
      { ok: false, code: "THREAD_NOT_FOUND", message: "Thread not found" },
      { status: 404 }
    );
  }

  const thread = await loadThread(
    id,
    user ? { userId: user.id } : { anonymousId: anonymousId! }
  );
  if (!thread) {
    return NextResponse.json(
      { ok: false, code: "THREAD_NOT_FOUND", message: "Thread not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, thread }, { status: 200 });
}
