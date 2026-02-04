/**
 * GET /api/health/env
 * Health check endpoint to verify environment variables are loaded
 * Returns JSON with booleans (no secrets)
 */

import { withErrorHandling, jsonOk } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = () =>
  withErrorHandling(async () => {
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    const databaseUrlPrefix = hasDatabaseUrl
      ? process.env.DATABASE_URL!.substring(0, 30)
      : null;

    const enableDevLogin = process.env.ENABLE_DEV_LOGIN === "true";
    const hasDevLoginToken = !!process.env.DEV_LOGIN_TOKEN;
    const enablePublicDevLogin = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";
    const hasPublicDevLoginToken = !!process.env.NEXT_PUBLIC_DEV_LOGIN_TOKEN;
    const hasAuthSecret = !!process.env.AUTH_SECRET;

    return jsonOk({
      env: {
        hasDatabaseUrl,
        databaseUrlPrefix, // Only first 30 chars, not full URL
        enableDevLogin,
        hasDevLoginToken,
        enablePublicDevLogin,
        hasPublicDevLoginToken,
        hasAuthSecret,
      },
    });
  });

