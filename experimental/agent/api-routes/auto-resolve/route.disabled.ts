/**
 * Auto-Resolution API Route
 * Server-only endpoint for auto-resolving buyer messages
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { autoResolveBuyerIntent } from "@/lib/autoResolution.server";
import { Message } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUserFromRequest(request);

    const body = await request.json();
    const { message, sellerId } = body;

    if (!message || !sellerId) {
      return NextResponse.json(
        { ok: false, error: "message and sellerId are required" },
        { status: 400 }
      );
    }

    // Validate message structure
    const validatedMessage = message as Message;

    // Call server-only auto-resolution function
    const result = await autoResolveBuyerIntent(validatedMessage, sellerId);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error in auto-resolve API:", error);
    }
    return NextResponse.json(
      { ok: false, error: "Failed to auto-resolve message" },
      { status: 500 }
    );
  }
}


