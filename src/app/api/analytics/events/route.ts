/**
 * First-party analytics event ingestion (no auth).
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

/** Normalize a header value for storage: trim; empty → null. */
function normalizeGeoHeader(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * First non-empty normalized header (headers are case-insensitive in the Fetch API).
 * Vercel: x-vercel-ip-*; Cloudflare: cf-ipcountry; CloudFront: cloudfront-viewer-*.
 */
function pickFirstGeoHeader(request: NextRequest, names: readonly string[]): string | null {
  for (const name of names) {
    const v = normalizeGeoHeader(request.headers.get(name));
    if (v !== null) return v;
  }
  return null;
}

function coarseGeoFromRequest(request: NextRequest): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  return {
    country: pickFirstGeoHeader(request, ["x-vercel-ip-country", "cf-ipcountry"]),
    region: pickFirstGeoHeader(request, [
      "x-vercel-ip-country-region",
      "cloudfront-viewer-country-region",
    ]),
    city: pickFirstGeoHeader(request, ["x-vercel-ip-city", "cloudfront-viewer-city"]),
  };
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError("BAD_REQUEST", "Invalid request body", 400);
    }

    const b = body as Record<string, unknown>;

    if (!isNonEmptyString(b.name)) {
      return jsonError("BAD_REQUEST", "name is required", 400);
    }
    if (!isNonEmptyString(b.visitorId)) {
      return jsonError("BAD_REQUEST", "visitorId is required", 400);
    }
    if (!isNonEmptyString(b.sessionId)) {
      return jsonError("BAD_REQUEST", "sessionId is required", 400);
    }

    const sourceOpt = optionalNullableString(b.source);
    const mediumOpt = optionalNullableString(b.medium);
    const campaignOpt = optionalNullableString(b.campaign);
    const pathOpt = optionalNullableString(b.path);

    if (
      b.source !== undefined &&
      sourceOpt === undefined &&
      b.source !== null
    ) {
      return jsonError("BAD_REQUEST", "source must be a string or null", 400);
    }
    if (
      b.medium !== undefined &&
      mediumOpt === undefined &&
      b.medium !== null
    ) {
      return jsonError("BAD_REQUEST", "medium must be a string or null", 400);
    }
    if (
      b.campaign !== undefined &&
      campaignOpt === undefined &&
      b.campaign !== null
    ) {
      return jsonError("BAD_REQUEST", "campaign must be a string or null", 400);
    }
    if (b.path !== undefined && pathOpt === undefined && b.path !== null) {
      return jsonError("BAD_REQUEST", "path must be a string or null", 400);
    }

    let propertiesJson: string | null = null;
    if (b.properties !== undefined && b.properties !== null) {
      if (typeof b.properties !== "object" || Array.isArray(b.properties)) {
        return jsonError("BAD_REQUEST", "properties must be an object", 400);
      }
      propertiesJson = JSON.stringify(b.properties);
    }

    const geo = coarseGeoFromRequest(request);

    const prisma = getPrisma();
    await prisma.analyticsEvent.create({
      data: {
        name: b.name.trim(),
        visitorId: b.visitorId.trim(),
        sessionId: b.sessionId.trim(),
        source: sourceOpt === undefined ? null : sourceOpt,
        medium: mediumOpt === undefined ? null : mediumOpt,
        campaign: campaignOpt === undefined ? null : campaignOpt,
        path: pathOpt === undefined ? null : pathOpt,
        properties: propertiesJson,
        country: geo.country,
        region: geo.region,
        city: geo.city,
      },
    });

    return jsonOk({ stored: true }, 201);
  });
}
