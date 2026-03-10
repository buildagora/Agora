/**
 * Expand Fallback Suppliers API Route
 * Server-only endpoint to expand fallback suppliers for a request
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { checkAndExpandFallback } from "@/lib/requestDispatch";
import { getRequest } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> }
) {
  try {
    const user = await requireCurrentUserFromRequest(request);
    const { rfqId } = await params;

    // Get the request
    const req = await getRequest(rfqId, user.id);
    if (!req) {
      return NextResponse.json(
        { ok: false, error: "Request not found" },
        { status: 404 }
      );
    }

    // Ensure status is "posted"
    if (req.status !== "posted") {
      return NextResponse.json(
        { ok: false, error: "Request must be posted to expand fallback" },
        { status: 400 }
      );
    }

    // Expand fallback suppliers
    const result = await checkAndExpandFallback(req);

    return NextResponse.json({
      ok: true,
      result: result || null,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error expanding fallback:", error);
    }
    return NextResponse.json(
      { ok: false, error: "Failed to expand fallback" },
      { status: 500 }
    );
  }
}


