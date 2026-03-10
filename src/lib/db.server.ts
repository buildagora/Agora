import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { logDatabaseFingerprint, getDatabaseFingerprint, getDatabaseUrlHash } from "./dbFingerprint";
import { assertDevDbLock } from "./devDbLock";
import { assertPrismaResolution, getPrismaClientPath } from "./prismaResolutionGuard";

// Hard guard: Never allow this module in browser
if (typeof window !== "undefined") {
  throw new Error(
    "db.server.ts cannot be imported in browser. This is a server-only module."
  );
}

// Hard guard: Never allow this module in Edge runtime
if (process.env.NEXT_RUNTIME === "edge") {
  throw new Error(
    "db.server.ts cannot be used in Edge runtime. Use Node.js runtime only."
  );
}

// TASK 3: SINGLE PRISMA CLIENT - Hard stop if wrong client is used
// This checks where Node.js actually resolves @prisma/client from
if (process.env.NODE_ENV !== "production") {
  assertPrismaResolution();
  
  // Log Prisma Client resolution path for verification
  const prismaPath = getPrismaClientPath();
  console.log("");
  console.log("=".repeat(70));
  console.log("[PRISMA_CLIENT_RESOLUTION]");
  console.log("=".repeat(70));
  console.log(`Resolved path: ${prismaPath}`);
  if (prismaPath.includes("/agora/node_modules")) {
    console.log("✅ Prisma Client resolved from correct location");
  } else {
    console.log("❌ Prisma Client resolved from unexpected location");
  }
  console.log("=".repeat(70));
  console.log("");
}

// Validate DATABASE_URL - MUST be PostgreSQL, no SQLite fallback
// This guard runs at module load time (server-only, nodejs runtime only)
function validateDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  
  // Check if missing
  if (!databaseUrl || !databaseUrl.trim()) {
    const urlPrefix = databaseUrl ? databaseUrl.substring(0, 20) : "undefined";
    const nodeEnv = process.env.NODE_ENV || "undefined";
    const nextRuntime = process.env.NEXT_RUNTIME || "undefined";
    throw new Error(
      `DATABASE_URL is missing. Set DATABASE_URL in .env.local. ` +
      `Current prefix: ${urlPrefix}... (NODE_ENV=${nodeEnv}, NEXT_RUNTIME=${nextRuntime}). ` +
      `Required format: postgresql://user:password@host:port/dbname`
    );
  }
  
  // Check if SQLite (file:)
  if (databaseUrl.startsWith("file:")) {
    const urlPrefix = databaseUrl.substring(0, 20);
    const nodeEnv = process.env.NODE_ENV || "undefined";
    const nextRuntime = process.env.NEXT_RUNTIME || "undefined";
    throw new Error(
      `DATABASE_URL points to SQLite (file:), but schema expects PostgreSQL. ` +
      `Current prefix: ${urlPrefix}... (NODE_ENV=${nodeEnv}, NEXT_RUNTIME=${nextRuntime}). ` +
      `Update DATABASE_URL in .env.local to: postgresql://user:password@localhost:5432/dbname`
    );
  }
  
  // Check if PostgreSQL format
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    const urlPrefix = databaseUrl.substring(0, 20);
    throw new Error(
      `DATABASE_URL must start with postgresql:// or postgres://. ` +
      `Current prefix: ${urlPrefix}... ` +
      `Update DATABASE_URL in .env.local to: postgresql://user:password@localhost:5432/dbname`
    );
  }
  
  return databaseUrl;
}

// Validate at module load (server-only, nodejs runtime only)
const databaseUrl = validateDatabaseUrl();

// TASK 1: DATABASE REALITY - Expose exact DB fingerprint at startup
// Log DB fingerprint once at startup (dev only)
// TASK A: Single source of truth - uses process.env.DATABASE_URL only
if (process.env.NODE_ENV !== "production") {
  const fingerprint = getDatabaseFingerprint();
  const urlHash = getDatabaseUrlHash();
  console.log("");
  console.log("=".repeat(70));
  console.log("[DATABASE_REALITY]");
  console.log("=".repeat(70));
  console.log(`Host: ${fingerprint.host}`);
  console.log(`Port: ${fingerprint.port}`);
  console.log(`Database: ${fingerprint.database}`);
  if (fingerprint.schema) {
    console.log(`Schema: ${fingerprint.schema}`);
  }
  console.log(`URL Hash: ${urlHash}`);
  console.log("=".repeat(70));
  console.log("");
}
logDatabaseFingerprint("APP");

// TASK 4: PROVE BASIC QUERY - Verify prisma.user.count() works on startup (DEV ONLY)
// This is a hard requirement: if we cannot query User table, the app cannot run
if (process.env.NODE_ENV !== "production") {
  process.nextTick(async () => {
    try {
      const prisma = getPrisma();
      const fingerprint = getDatabaseFingerprint();
      const urlHash = getDatabaseUrlHash();
      const prismaPath = getPrismaClientPath();
      
      // TASK 4: Prove basic query - run prisma.user.count()
      const userCount = await prisma.user.count();
      
      // Log success with diagnostics
      console.log("");
      console.log("=".repeat(70));
      console.log("[BASIC_QUERY_PROVEN]");
      console.log("=".repeat(70));
      console.log(`User count: ${userCount}`);
      console.log(`Prisma Client path: ${prismaPath}`);
      console.log(`Database: ${fingerprint.database} @ ${fingerprint.host}:${fingerprint.port}`);
      console.log(`URL Hash: ${urlHash}`);
      console.log("=".repeat(70));
      console.log("");
      
      // TASK 6: Check if database is clean (dev only)
      if (userCount > 0) {
        const enforceClean = process.env.ENFORCE_CLEAN_DEV_DB === "1";
        
        console.warn("");
        console.warn("=".repeat(70));
        console.warn("⚠️  DEV DATABASE NOT CLEAN");
        console.warn("=".repeat(70));
        console.warn("");
        console.warn(`Found ${userCount} user(s) in the database.`);
        console.warn("The database should be empty on startup in development.");
        console.warn("");
        console.warn("Run: npm run dev:reset");
        console.warn("");
        if (enforceClean) {
          console.warn("ENFORCE_CLEAN_DEV_DB=1 is set — exiting");
          console.warn("");
          console.warn("=".repeat(70));
          console.warn("");
          process.exit(1);
        } else {
          console.warn("Continuing (set ENFORCE_CLEAN_DEV_DB=1 to exit on dirty DB)");
          console.warn("");
          console.warn("=".repeat(70));
          console.warn("");
        }
      }
    } catch (error: any) {
      // TASK 4: If prisma.user.count() throws, the app MUST NOT RUN
      const fingerprint = getDatabaseFingerprint();
      const urlHash = getDatabaseUrlHash();
      const prismaPath = getPrismaClientPath();
      
      console.error("");
      console.error("=".repeat(70));
      console.error("❌ BASIC QUERY FAILED — CANNOT START SERVER");
      console.error("=".repeat(70));
      console.error("");
      console.error("prisma.user.count() failed with:");
      console.error(`  Error: ${error?.message || String(error)}`);
      console.error("");
      console.error("Diagnostics:");
      console.error(`  Prisma Client path: ${prismaPath}`);
      console.error(`  Database: ${fingerprint.database} @ ${fingerprint.host}:${fingerprint.port}`);
      console.error(`  URL Hash: ${urlHash}`);
      console.error("");
      console.error("This means:");
      console.error("  1. Prisma Client does not match schema");
      console.error("  2. Schema and generated client are out of sync");
      console.error("  3. Database connection is invalid");
      console.error("  4. User model does not exist in Prisma Client");
      console.error("");
      console.error("Fix:");
      console.error("  cd agora");
      console.error("  npm run prisma:reinstall");
      console.error("");
      console.error("=".repeat(70));
      console.error("");
      process.exit(1);
    }
  });
}

// TASK B: Enforce DB lock on startup (dev only)
// This ensures the app is using the same DB that was purged
try {
  assertDevDbLock();
} catch (error: any) {
  // In dev, hard fail if DB lock mismatch
  console.error("");
  console.error("=".repeat(70));
  console.error(error.message);
  console.error("=".repeat(70));
  console.error("");
  console.error("The app cannot start because the database has changed since the last purge.");
  console.error("This prevents 'email already exists' errors after purge.");
  console.error("");
  throw error; // Re-throw to crash the app
}

// Create connection pool (lazy, but validated)
let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
    });
  }
  return pool;
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export function getPrisma(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      adapter: new PrismaPg(getPool()),
    });
    
    // Runtime guard: Verify prisma.user exists (Prisma Client matches schema)
    if (!globalThis.__prisma.user) {
      throw new Error(
        "CRITICAL: Prisma Client does not match schema. " +
        "prisma.user is undefined. " +
        "Run 'npm run db:generate' from /agora directory. " +
        "Schema path must be: agora/prisma/schema.prisma"
      );
    }
    
    // Runtime guard: Verify prisma.agentThread exists (Prisma Client matches schema)
    // TEMPORARILY DISABLED: Agent is moved to src/agent and not part of build
    // if (!globalThis.__prisma.agentThread) {
    //   const prismaKeys = Object.keys(globalThis.__prisma).filter(key => !key.startsWith("$") && !key.startsWith("_"));
    //   throw new Error(
    //     "CRITICAL: Prisma Client does not include AgentThread model. " +
    //     `Available models: ${prismaKeys.join(", ")}. ` +
    //     "Run 'npx prisma generate' from /agora directory to regenerate the client. " +
    //     "Then restart the dev server."
    //   );
    // }
  }
  return globalThis.__prisma;
}

// Re-export fingerprint function from centralized module
export { getDatabaseFingerprint } from "./dbFingerprint";

// DO NOT export prisma at module scope - it creates PrismaClient at import time
// Always use getPrisma() inside route handlers to ensure lazy initialization
// Export prisma only for backward compatibility, but prefer getPrisma()
export const prisma = getPrisma();
