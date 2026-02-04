/**
 * Database Fingerprint Utility
 * 
 * Server-only module to extract safe database connection info for diagnostics.
 * NEVER logs username/password - only host, port, database, schema.
 */

// Removed server-only: This module is used by scripts and API routes
import { createHash } from "crypto";

/**
 * Compute a short hash of DATABASE_URL (first 10 chars of sha256)
 * Used to verify DATABASE_URL consistency across app and scripts
 */
export function getDatabaseUrlHash(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return "missing";
  }
  return createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
}

/**
 * Parse DATABASE_URL and return safe fingerprint (no secrets)
 */
export function getDatabaseFingerprint(): { host: string; port: string; database: string; schema?: string } {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return { host: "unknown", port: "unknown", database: "unknown" };
  }

  try {
    const urlObj = new URL(databaseUrl);
    const fingerprint: { host: string; port: string; database: string; schema?: string } = {
      host: urlObj.hostname,
      port: urlObj.port || "5432",
      database: urlObj.pathname.replace(/^\//, "").split("?")[0], // Remove leading slash and query params
    };
    
    // Extract schema from query params if present (e.g., ?schema=public)
    const schemaParam = urlObj.searchParams.get("schema");
    if (schemaParam) {
      fingerprint.schema = schemaParam;
    }
    
    return fingerprint;
  } catch {
    return { host: "unknown", port: "unknown", database: "unknown" };
  }
}

/**
 * Log database fingerprint (dev only)
 */
export function logDatabaseFingerprint(source: string): void {
  if (process.env.NODE_ENV !== "production") {
    const fingerprint = getDatabaseFingerprint();
    const urlHash = getDatabaseUrlHash();
    console.log(`[${source}_DB_FINGERPRINT]`, {
      host: fingerprint.host,
      port: fingerprint.port,
      db: fingerprint.database,
      schema: fingerprint.schema,
      urlHash, // Hash of DATABASE_URL for consistency verification
      source: source.toLowerCase(),
    });
  }
}

/**
 * Log EXACT Prisma connection info (dev only)
 * TASK 1: Expose real database connection details
 */
export function logAuthDbRuntimeTarget(): void {
  if (process.env.NODE_ENV !== "production") {
    const fingerprint = getDatabaseFingerprint();
    const databaseUrl = process.env.DATABASE_URL || "";
    
    // Redact password from DATABASE_URL
    let redactedUrl = databaseUrl;
    try {
      const urlObj = new URL(databaseUrl);
      if (urlObj.password) {
        urlObj.password = "***REDACTED***";
        redactedUrl = urlObj.toString();
      }
    } catch {
      // If URL parsing fails, just show prefix
      redactedUrl = databaseUrl.substring(0, 30) + "...";
    }
    
    console.log("[AUTH_DB_RUNTIME_TARGET]", {
      database: fingerprint.database,
      host: fingerprint.host,
      port: fingerprint.port,
      schema: fingerprint.schema || "default",
      databaseUrl: redactedUrl,
      urlHash: getDatabaseUrlHash(),
    });
  }
}
