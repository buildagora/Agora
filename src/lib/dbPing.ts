/**
 * Database ping utility with timeout
 * Server-only module
 * 
 * NOTE: Prisma is imported dynamically to prevent module evaluation errors
 */

import "server-only";

/**
 * Ping database with timeout
 * @param timeoutMs Timeout in milliseconds (default: 2500ms)
 * @returns Promise that resolves if DB responds within timeout
 */
export async function pingDb(timeoutMs = 2500): Promise<unknown> {
  // Import prisma dynamically inside function
  const { prisma } = await import("@/lib/db.server");
  
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("DB_CONNECT_TIMEOUT")), timeoutMs);
  });
  
  return Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
}

