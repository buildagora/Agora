/**
 * GET /api/health/db
 * Health check endpoint to verify database connectivity
 * Returns detailed error diagnostics (no secrets)
 */

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStackFirstLines(error: Error, maxLines = 10): string[] {
  if (!error.stack) return [];
  return error.stack.split("\n").slice(0, maxLines);
}

export async function GET() {
  try {
    const prisma = getPrisma();
    // Use $executeRaw for simple connectivity test (more reliable than $queryRaw)
    await prisma.$executeRaw`SELECT 1`;
    
    return NextResponse.json(
      { ok: true, db: "up" },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    // Extract error details safely (no secrets)
    const errorName = error?.name || "UnknownError";
    const errorMessage = error?.message || String(error) || "Database connection failed";
    const errorCode = error?.code || null;
    const errorMeta = error?.meta || null;
    
    // Get stack trace (first 10 lines only)
    const stackFirstLines = error instanceof Error ? getStackFirstLines(error, 10) : [];
    
    // Get env diagnostics (safe, no secrets)
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    const databaseUrlPrefix = hasDatabaseUrl
      ? process.env.DATABASE_URL!.substring(0, 30)
      : null;
    const nodeEnv = process.env.NODE_ENV || null;
    const nextRuntime = process.env.NEXT_RUNTIME || null;
    
    // Determine error code based on error type
    let code = "DB_DOWN";
    if (errorCode === "P1001" || errorMessage.includes("Can't reach database server")) {
      code = "DB_CONNECTION_FAILED";
    } else if (errorCode === "P1000" || errorMessage.includes("Authentication failed")) {
      code = "DB_AUTH_FAILED";
    } else if (errorCode === "P1003" || errorMessage.includes("database") && errorMessage.includes("does not exist")) {
      code = "DB_NOT_FOUND";
    } else if (!hasDatabaseUrl) {
      code = "DB_URL_MISSING";
    }
    
    return NextResponse.json(
      {
        ok: false,
        code,
        message: errorMessage,
        errorName,
        errorMessage: errorMessage, // Full message
        errorCode,
        errorMeta,
        stackFirstLines,
        env: {
          hasDatabaseUrl,
          databaseUrlPrefix,
          nodeEnv,
          nextRuntime,
        },
      },
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

