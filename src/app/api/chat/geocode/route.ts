/**
 * POST /api/chat/geocode
 *
 * Reverse-geocode a lat/lng to a short label like "Knoxville, TN" via Nominatim.
 * The chat composer's location pill calls this to display a friendly name once
 * the browser has granted geolocation.
 *
 * Request:  { lat: number, lng: number }
 * Response: { ok: true, label: string }  |  { ok: false, code, message }
 */

import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/chat/geocode.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { lat?: unknown; lng?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "Body must be JSON" },
      { status: 400 }
    );
  }

  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lng = typeof body.lng === "number" ? body.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { ok: false, code: "INVALID_COORDS", message: "lat/lng must be valid numbers" },
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
