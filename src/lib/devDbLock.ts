/**
 * DEV-ONLY Database Lock Mechanism
 * 
 * Ensures that the purge script and the running app are always pointing at the same database.
 * This prevents "email already exists" errors after purge when DBs are misaligned.
 * 
 * The lock file (scripts/.agora-db-lock.json) is created by the purge script after successful purge.
 * The app checks this lock on startup and in auth routes to ensure DB consistency.
 */

// Removed server-only: This module is used by scripts and API routes
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { getDatabaseFingerprint } from "./dbFingerprint";

const LOCK_FILE_PATH = resolve(process.cwd(), "scripts", ".agora-db-lock.json");

interface DbLock {
  host: string;
  port: string;
  db: string;
  schema?: string;
  databaseUrlHash: string; // Short hash of DATABASE_URL for extra verification
  createdAt: string; // ISO timestamp
}

/**
 * Compute a short hash of DATABASE_URL (first 10 chars of sha256)
 */
function hashDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return "missing";
  }
  return createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
}

/**
 * Read the lock file if it exists
 */
function readLockFile(): DbLock | null {
  if (!existsSync(LOCK_FILE_PATH)) {
    return null;
  }
  
  try {
    const content = readFileSync(LOCK_FILE_PATH, "utf-8");
    return JSON.parse(content) as DbLock;
  } catch (error) {
    // If lock file is corrupted, treat as missing
    console.warn("[DEV_DB_LOCK] Failed to read lock file:", error);
    return null;
  }
}

/**
 * Compare two fingerprints for equality (host, port, db, schema)
 */
function fingerprintsMatch(
  current: { host: string; port: string; database: string; schema?: string },
  locked: { host: string; port: string; db: string; schema?: string }
): boolean {
  return (
    current.host === locked.host &&
    current.port === locked.port &&
    current.database === locked.db &&
    (current.schema || undefined) === (locked.schema || undefined)
  );
}

/**
 * Assert that the current database matches the lock file (dev only)
 * 
 * Throws an error if:
 * - Lock file exists but current DB fingerprint doesn't match
 * - Lock file exists but DATABASE_URL hash doesn't match
 * 
 * Does nothing in production.
 */
export function assertDevDbLock(): void {
  // Only enforce in development
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const lock = readLockFile();
  if (!lock) {
    // No lock file exists - this is OK (purge hasn't been run yet, or lock was cleared)
    return;
  }

  // Get current database fingerprint
  const currentFingerprint = getDatabaseFingerprint();
  const currentUrlHash = hashDatabaseUrl();

  // Check if fingerprints match
  if (!fingerprintsMatch(currentFingerprint, lock)) {
    const errorMessage = [
      "❌ DB LOCK MISMATCH: Database fingerprint does not match lock file.",
      "",
      "Lock file indicates purge ran on:",
      `  Host: ${lock.host}`,
      `  Port: ${lock.port}`,
      `  Database: ${lock.db}`,
      lock.schema ? `  Schema: ${lock.schema}` : "",
      `  Created: ${lock.createdAt}`,
      "",
      "But app is running on:",
      `  Host: ${currentFingerprint.host}`,
      `  Port: ${currentFingerprint.port}`,
      `  Database: ${currentFingerprint.database}`,
      currentFingerprint.schema ? `  Schema: ${currentFingerprint.schema}` : "",
      "",
      "Fix: Re-run 'npm run purge:dev' with the same DATABASE_URL, or fix your .env.local",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    throw new Error(errorMessage);
  }

  // Check if DATABASE_URL hash matches (extra verification)
  if (currentUrlHash !== lock.databaseUrlHash) {
    const errorMessage = [
      "❌ DB LOCK MISMATCH: DATABASE_URL hash does not match lock file.",
      "",
      "The DATABASE_URL has changed since the last purge.",
      "This could mean you're pointing at a different database.",
      "",
      "Fix: Re-run 'npm run purge:dev' with the current DATABASE_URL, or restore the original DATABASE_URL",
      "",
    ].join("\n");

    throw new Error(errorMessage);
  }
}

/**
 * Write the lock file (used by purge script)
 * This is NOT called by the app - only by the purge script
 */
export function writeDevDbLock(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot write DB lock in production");
  }

  const fingerprint = getDatabaseFingerprint();
  const urlHash = hashDatabaseUrl();

  const lock: DbLock = {
    host: fingerprint.host,
    port: fingerprint.port,
    db: fingerprint.database,
    schema: fingerprint.schema,
    databaseUrlHash: urlHash,
    createdAt: new Date().toISOString(),
  };

  const lockDir = resolve(process.cwd(), "scripts");
  
  // Ensure scripts directory exists
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  writeFileSync(LOCK_FILE_PATH, JSON.stringify(lock, null, 2), "utf-8");
  console.log("[DEV_DB_LOCK] Lock file written:", LOCK_FILE_PATH);
}
