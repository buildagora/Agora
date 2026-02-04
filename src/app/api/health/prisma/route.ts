/**
 * GET /api/health/db
 * Health check endpoint to verify database connectivity
 * Fast-fail with timeout to prevent hanging
 */

import { withErrorHandling, jsonOk, jsonError } from "@/lib/apiResponse";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = () =>
  withErrorHandling(async () => {
    try {
      const prisma = getPrisma();
      // Simple query to test DB connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      return jsonOk({ ok: true, db: "up" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Database connection failed");
      return jsonError("DB_DOWN", `Database not responding: ${message}`, 503);
    }
  });

