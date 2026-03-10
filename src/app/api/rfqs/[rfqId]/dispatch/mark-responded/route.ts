/**
 * Mark Dispatch As Responded API Route
 * Server-only endpoint to mark a dispatch record as responded
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { markDispatchAsResponded } from "@/lib/requestDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  try {
    const user = await requireCurrentUserFromRequest(request);
    const { rfqId } = await params;

    // Mark dispatch as responded
    await markDispatchAsResponded(rfqId, user.id);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error marking dispatch as responded:", error);
    }
    return NextResponse.json(
      { ok: false, error: "Failed to mark dispatch as responded" },
      { status: 500 }
    );
  }
}


