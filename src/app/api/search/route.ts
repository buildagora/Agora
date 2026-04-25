/**
 * POST /api/search
 *
 * Kicks off a supplier search for a chat thread. Synchronous: the response
 * comes back once Gemini has finished verifying the candidate suppliers.
 *
 * Request body:
 *   {
 *     threadId: string,
 *     query: string,
 *     location: { label: string, lat: number, lng: number },
 *     radiusMiles?: number,    // default 25
 *   }
 *
 * Response 200:  { ok: true, searchId: string, threadId: string }
 * Response 4xx:  { ok: false, code, message }
 *
 * Ownership: thread must be owned by the caller (logged-in user OR
 * matching anonymous cookie). Returns 404 if not.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import { readAnonymousId } from "@/lib/chat/anonId.server";
import { loadThread } from "@/lib/chat/threads.server";
import {
  persistThreadLocation,
  runSearch,
} from "@/lib/search/runSearch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  threadId?: unknown;
  query?: unknown;
  location?: unknown;
  radiusMiles?: unknown;
};

function parseLocation(
  raw: unknown
): { label: string; lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const label = typeof obj.label === "string" ? obj.label.trim() : "";
  const lat = typeof obj.lat === "number" ? obj.lat : NaN;
  const lng = typeof obj.lng === "number" ? obj.lng : NaN;
  if (
    !label ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { label, lat, lng };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "Body must be JSON" },
      { status: 400 }
    );
  }

  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  const query =
    typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
  const location = parseLocation(body.location);
  const radiusMiles =
    typeof body.radiusMiles === "number" && body.radiusMiles > 0
      ? Math.min(body.radiusMiles, 250)
      : undefined;

  if (!threadId) {
    return NextResponse.json(
      { ok: false, code: "MISSING_THREAD_ID", message: "`threadId` is required" },
      { status: 400 }
    );
  }
  if (!query) {
    return NextResponse.json(
      { ok: false, code: "MISSING_QUERY", message: "`query` is required" },
      { status: 400 }
    );
  }
  if (!location) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_LOCATION",
        message: "`location` must include label, lat, and lng",
      },
      { status: 400 }
    );
  }

  // Ownership check
  const user = await getCurrentUserFromRequest(req);
  const anonymousId = user ? null : readAnonymousId(req);
  if (!user && !anonymousId) {
    return NextResponse.json(
      { ok: false, code: "THREAD_NOT_FOUND", message: "Thread not found" },
      { status: 404 }
    );
  }
  const owner = user ? { userId: user.id } : { anonymousId: anonymousId! };
  const thread = await loadThread(threadId, owner);
  if (!thread) {
    return NextResponse.json(
      { ok: false, code: "THREAD_NOT_FOUND", message: "Thread not found" },
      { status: 404 }
    );
  }

  // Persist location for future searches on this thread
  await persistThreadLocation({ threadId, location });

  let result;
  try {
    result = await runSearch({
      threadId,
      query,
      location,
      radiusMiles,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        code: "SEARCH_FAILED",
        message: err?.message ?? "Search failed",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, searchId: result.searchId, threadId },
    { status: 200 }
  );
}
