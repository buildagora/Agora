/**
 * DEV HARD RESET - Canonical database reset script
 * 
 * This script wipes all auth-related data from the development database.
 * It uses the SAME DATABASE_URL and fingerprint as the Next.js app.
 * 
 * IMPORTANT: This script must run from /agora/agora directory.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { config } from "dotenv";
import { resolve } from "path";

// Ensure we're in the app directory (where prisma/schema.prisma exists)
const appDir = resolve(__dirname, "..");
process.chdir(appDir);

// Load environment variables from app directory
config({ path: resolve(appDir, ".env.local") });
config({ path: resolve(appDir, ".env") });

// Import DB fingerprint helpers (same as app uses)
// We can't import from src/lib/dbFingerprint.ts directly in a standalone script,
// so we duplicate the logic here to ensure consistency
function getDatabaseFingerprint(): { host: string; port: string; database: string; schema?: string } {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return { host: "unknown", port: "unknown", database: "unknown" };
  }

  try {
    const urlObj = new URL(databaseUrl);
    const fingerprint: { host: string; port: string; database: string; schema?: string } = {
      host: urlObj.hostname,
      port: urlObj.port || "5432",
      database: urlObj.pathname.replace(/^\//, "").split("?")[0],
    };
    
    const schemaParam = urlObj.searchParams.get("schema");
    if (schemaParam) {
      fingerprint.schema = schemaParam;
    }
    
    return fingerprint;
  } catch {
    return { host: "unknown", port: "unknown", database: "unknown" };
  }
}

function getDatabaseUrlHash(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return "missing";
  }
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
}

async function devHardReset() {
  // DEV ONLY guard: throw if NODE_ENV === "production"
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot run hard reset in production");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  // Print dbFingerprint BEFORE deleting (same format as app startup)
  const dbFingerprint = getDatabaseFingerprint();
  const urlHash = getDatabaseUrlHash();
  
  console.log("");
  console.log("=".repeat(70));
  console.log("🗑️  DEV HARD RESET");
  console.log("=".repeat(70));
  console.log("Database fingerprint (must match [DATABASE_REALITY] at app startup):");
  console.log(`  Host: ${dbFingerprint.host}`);
  console.log(`  Port: ${dbFingerprint.port}`);
  console.log(`  Database: ${dbFingerprint.database}`);
  if (dbFingerprint.schema) {
    console.log(`  Schema: ${dbFingerprint.schema}`);
  }
  console.log(`  URL Hash: ${urlHash}`);
  console.log("=".repeat(70));
  console.log("");

  // Use Prisma client with adapter (same pattern as app's db.server.ts)
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Log counts BEFORE deleting data
    const beforeCounts = {
      notification: await prisma.notification.count(),
      message: await prisma.message.count(),
      bid: await prisma.bid.count(),
      order: await prisma.order.count(),
      preferredSupplierRule: await prisma.preferredSupplierRule.count(),
      rfq: await prisma.rFQ.count(),
      user: await prisma.user.count(),
    };

    console.log("📊 BEFORE deletion:");
    console.log(`  Notification: ${beforeCounts.notification}`);
    console.log(`  Message: ${beforeCounts.message}`);
    console.log(`  Bid: ${beforeCounts.bid}`);
    console.log(`  Order: ${beforeCounts.order}`);
    console.log(`  PreferredSupplierRule: ${beforeCounts.preferredSupplierRule}`);
    console.log(`  RFQ: ${beforeCounts.rfq}`);
    console.log(`  User: ${beforeCounts.user}`);
    console.log("");

    // Delete ALL auth-related data in safe FK order using deleteMany()
    console.log("🗑️  Deleting all auth-related data...");
    await prisma.notification.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.bid.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.preferredSupplierRule.deleteMany({});
    await prisma.rFQ.deleteMany({});
    await prisma.user.deleteMany({});
    console.log("  ✓ Deletion complete");
    console.log("");

    // Verify all counts are zero AFTER
    const afterCounts = {
      notification: await prisma.notification.count(),
      message: await prisma.message.count(),
      bid: await prisma.bid.count(),
      order: await prisma.order.count(),
      preferredSupplierRule: await prisma.preferredSupplierRule.count(),
      rfq: await prisma.rFQ.count(),
      user: await prisma.user.count(),
    };

    console.log("📊 AFTER deletion:");
    console.log(`  Notification: ${afterCounts.notification}`);
    console.log(`  Message: ${afterCounts.message}`);
    console.log(`  Bid: ${afterCounts.bid}`);
    console.log(`  Order: ${afterCounts.order}`);
    console.log(`  PreferredSupplierRule: ${afterCounts.preferredSupplierRule}`);
    console.log(`  RFQ: ${afterCounts.rfq}`);
    console.log(`  User: ${afterCounts.user}`);
    console.log("");

    // At end, verify User count is exactly 0, else throw
    if (afterCounts.user !== 0) {
      throw new Error(`User count is ${afterCounts.user}, expected 0`);
    }

    // Verify all counts are zero
    const allZero = Object.values(afterCounts).every(count => count === 0);
    if (!allZero) {
      throw new Error("Some tables still have data after reset");
    }

    // Log: [DEV_HARD_RESET_COMPLETE] { userCount: 0 }
    const finalFingerprint = getDatabaseFingerprint();
    const finalUrlHash = getDatabaseUrlHash();
    console.log("[DEV_HARD_RESET_COMPLETE]", {
      userCount: afterCounts.user,
      dbFingerprint: {
        host: finalFingerprint.host,
        port: finalFingerprint.port,
        db: finalFingerprint.database,
        schema: finalFingerprint.schema,
        urlHash: finalUrlHash,
        source: "dev-hard-reset",
      },
    });
    console.log("");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

devHardReset()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
