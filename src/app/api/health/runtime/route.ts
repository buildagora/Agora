/**
 * GET /api/health/runtime
 * Health check endpoint to verify Node.js runtime and Prisma Client loading
 */

import { withErrorHandling, jsonOk } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = () =>
  withErrorHandling(async () => {
    let prismaClientLoaded = false;
    try {
      // Try to import prisma (this will fail if there's an engine type issue)
      const { prisma } = await import("@/lib/db.server");
      // Just accessing prisma to ensure it's loaded
      void prisma;
      prismaClientLoaded = true;
    } catch (error) {
      // Prisma failed to load - report but don't crash
      prismaClientLoaded = false;
    }

    // Log dev login env vars (server-side, no token values)
    const enableDevLogin = process.env.ENABLE_DEV_LOGIN === "true";
    const hasDevLoginToken = !!process.env.DEV_LOGIN_TOKEN;
    const enablePublicDevLogin = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";
    const hasPublicDevLoginToken = !!process.env.NEXT_PUBLIC_DEV_LOGIN_TOKEN;

    console.log("[ENV_CHECK]", {
      ENABLE_DEV_LOGIN: enableDevLogin,
      hasDEV_LOGIN_TOKEN: hasDevLoginToken,
      NEXT_PUBLIC_ENABLE_DEV_LOGIN: enablePublicDevLogin,
      hasNEXT_PUBLIC_DEV_LOGIN_TOKEN: hasPublicDevLoginToken,
    });

    return jsonOk({
      node: process.version,
      runtime: "nodejs",
      prismaClientLoaded,
      env: {
        enableDevLogin,
        hasDevLoginToken,
        enablePublicDevLogin,
        hasPublicDevLoginToken,
      },
    });
  });

