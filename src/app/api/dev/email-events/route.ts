/**
 * Dev-only email events debug endpoint
 * Returns last 10 EmailEvents for debugging
 * 
 * GUARD: Only available in development mode
 * NO AUTH REQUIRED in dev (for testing convenience)
 */

import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/apiResponse";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // GUARD: Only available in development
  if (process.env.NODE_ENV !== "development") {
    return jsonError("FORBIDDEN", "This endpoint is only available in development", 403);
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const rfqId = searchParams.get("rfqId");

    const prisma = getPrisma();

    // Build query
    const where: any = {};
    if (rfqId) {
      where.rfqId = rfqId;
    }

    // Get last 10 email events
    const emailEvents = await prisma.emailEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Format response
    const events = emailEvents.map((event) => ({
      id: event.id,
      to: event.to,
      subject: event.subject,
      status: event.status,
      providerMessageId: event.providerMessageId,
      error: event.error,
      rfqId: event.rfqId,
      supplierId: event.supplierId,
      createdAt: event.createdAt.toISOString(),
    }));

    return jsonOk(events, 200);
  } catch (error: any) {
    console.error("[EMAIL_EVENTS_DEBUG_ERROR]", {
      error: error.message,
      stack: error.stack,
    });

    return jsonError("INTERNAL_ERROR", error.message || "Failed to fetch email events", 500);
  }
}





