/**
 * Get Dispatch Records API Route
 * Server-only endpoint to get dispatch records for a request
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getDispatchRecords } from "@/lib/requestDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  try {
    const user = await requireCurrentUserFromRequest(request);
    const { rfqId } = await params;

    // Get dispatch records
    const records = getDispatchRecords(rfqId);

    return NextResponse.json({
      ok: true,
      records,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error getting dispatch records:", error);
    }
    return NextResponse.json(
      { ok: false, error: "Failed to get dispatch records" },
      { status: 500 }
    );
  }
}


