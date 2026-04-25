/**
 * POST /api/chat/geocode
 *
 * Two modes:
 * - Reverse: body { lat, lng }       → { ok, label }
 * - Forward: body { query: string }  → { ok, label, lat, lng }
 *
 * The chat composer's location pill calls reverse after browser
 * geolocation, and forward when the user types a city/ZIP manually.
 */

import { NextRequest, NextResponse } from "next/server";
import { forwardGeocode, reverseGeocode } from "@/lib/chat/geocode.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lat?: unknown; lng?: unknown; query?: unknown };

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

  // Forward mode
  if (typeof body.query === "string" && body.query.trim()) {
    const result = await forwardGeocode({ query: body.query.trim() });
    if (!result) {
      return NextResponse.json(
        { ok: false, code: "GEOCODE_FAILED", message: "Could not resolve location" },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  }

  // Reverse mode
  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lng = typeof body.lng === "number" ? body.lng : NaN;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        message: "Provide either { lat, lng } (reverse) or { query } (forward)",
      },
      { status: 400 }
    );
  }

  const result = await reverseGeocode({ lat, lng });
  if (!result) {
    return NextResponse.json(
      { ok: false, code: "GEOCODE_FAILED", message: "Could not resolve location" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, label: result.label }, { status: 200 });
}
