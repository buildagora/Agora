/**
 * FULL DATABASE ACCOUNT WIPE
 * 
 * WARNING: This deletes ALL user data in the database.
 * Only run in development environment.
 * 
 * This script:
 * 1. Prints DB fingerprint (host, port, db) BEFORE deleting
 * 2. Lists all auth-related tables and their row counts
 * 3. Deletes ALL data from these tables (using TRUNCATE CASCADE if Postgres)
 * 4. Verifies clean state (zero users)
 * 5. Exits non-zero if User count is not 0 after purge
 * 
 * Usage: npm run purge:dev
 * 
 * Requires: DATABASE_URL environment variable from .env.local
 */

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

// Load environment variables from .env.local (same as Next.js)
config({ path: resolve(process.cwd(), ".env.local") });
// Also try .env as fallback
config({ path: resolve(process.cwd(), ".env") });

// Import shared fingerprint function (standalone version for script)
// We can't import from src/lib/dbFingerprint.ts because it has "server-only"
// So we duplicate the logic here to ensure consistency
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
      database: urlObj.pathname.replace(/^\//, "").split("?")[0], // Remove leading slash and query params
    };
    
    // Extract schema from query params if present
    const schemaParam = urlObj.searchParams.get("schema");
    if (schemaParam) {
      fingerprint.schema = schemaParam;
    }
    
    return fingerprint;
  } catch {
    return { host: "unknown", port: "unknown", database: "unknown" };
  }
}

async function purgeAuthData() {
  // TASK B: Hard safety guards
  // 1. Refuse to run if NODE_ENV !== "development"
  if (process.env.NODE_ENV !== "development") {
    console.error("❌ ERROR: Cannot purge auth data unless NODE_ENV=development!");
    console.error(`   Current NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
    console.error("   Run: NODE_ENV=development npm run purge:dev");
    process.exit(1);
  }

  // 2. Validate DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set!");
    console.error("   Please set DATABASE_URL in .env.local or .env file");
    console.error("   Format: postgresql://user:password@host:port/dbname");
    process.exit(1);
  }

  // 3. Refuse to run if DATABASE_URL contains indicators of production
  const dbUrl = process.env.DATABASE_URL.toLowerCase();
  const productionIndicators = ["render.com", "supabase.co", "railway.app", "vercel.com", "heroku.com", "prod", "production"];
  const isProductionDb = productionIndicators.some(indicator => dbUrl.includes(indicator));
  
  if (isProductionDb) {
    console.error("❌ ERROR: DATABASE_URL appears to point to a production database!");
    console.error("   Production indicators found in DATABASE_URL");
    console.error("   This script can only run against development databases");
    process.exit(1);
  }

  // TASK A: Print DB fingerprint BEFORE deleting (for comparison with app)
  const dbFingerprint = getDatabaseFingerprint();
  const databaseUrl = process.env.DATABASE_URL || "";
  const urlHash = require("crypto").createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
  
  console.log("🗑️  FULL DATABASE ACCOUNT WIPE");
  console.log("=".repeat(50));
  console.log("");
  console.log("[PURGE_DB_FINGERPRINT]", {
    host: dbFingerprint.host,
    port: dbFingerprint.port,
    db: dbFingerprint.database,
    schema: dbFingerprint.schema,
    urlHash, // Hash of DATABASE_URL for consistency verification
    source: "purge-script",
  });
  console.log("");

  // Create standalone Prisma client for script (uses same DATABASE_URL as app)
  const prisma = new PrismaClient();

  try {
    // TASK 1: Identify and list auth-related tables
    console.log("📋 TASK 1: Identifying auth-related tables...");
    console.log("");

    const userCount = await prisma.user.count();
    const rfqCount = await prisma.rFQ.count();
    const bidCount = await prisma.bid.count();
    const messageCount = await prisma.message.count();
    const notificationCount = await prisma.notification.count();
    const orderCount = await prisma.order.count();
    const preferredSupplierRuleCount = await prisma.preferredSupplierRule.count();

    console.log("Auth-related tables (BEFORE deletion):");
    console.log(`  - User: ${userCount} rows`);
    console.log(`  - RFQ: ${rfqCount} rows`);
    console.log(`  - Bid: ${bidCount} rows`);
    console.log(`  - Message: ${messageCount} rows`);
    console.log(`  - Notification: ${notificationCount} rows`);
    console.log(`  - Order: ${orderCount} rows`);
    console.log(`  - PreferredSupplierRule: ${preferredSupplierRuleCount} rows`);
    console.log("");

    if (userCount === 0 && rfqCount === 0 && bidCount === 0 && messageCount === 0 && notificationCount === 0 && orderCount === 0 && preferredSupplierRuleCount === 0) {
      console.log("✅ Database is already clean (all tables empty).");
      console.log("[AUTH_DB_WIPE_COMPLETE] { userCount: 0 }");
      return;
    }

    // TASK 2: Wipe data (hard delete)
    console.log("🗑️  TASK 2: Deleting all data...");
    console.log("");

    // TASK B.3: Try TRUNCATE CASCADE for complete wipe (Postgres only)
    // This is faster and more thorough than DELETE
    try {
      console.log("  → Attempting TRUNCATE CASCADE (Postgres)...");
      await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE "Notification", "Message", "Bid", "Order", "PreferredSupplierRule", "RFQ", "User" CASCADE;
      `);
      console.log("    ✓ TRUNCATE CASCADE successful (all tables wiped)");
    } catch (truncateError: any) {
      // If TRUNCATE fails (e.g., not Postgres or permissions issue), fall back to DELETE
      console.log("    ⚠️  TRUNCATE CASCADE failed, falling back to DELETE...");
      console.log(`    Error: ${truncateError?.message || String(truncateError)}`);
      
      // Delete in order to respect foreign key constraints
      console.log("  → Deleting notifications...");
      const deletedNotifications = await prisma.notification.deleteMany({});
      console.log(`    ✓ Deleted ${deletedNotifications.count} notifications`);

      console.log("  → Deleting messages...");
      const deletedMessages = await prisma.message.deleteMany({});
      console.log(`    ✓ Deleted ${deletedMessages.count} messages`);

      console.log("  → Deleting bids...");
      const deletedBids = await prisma.bid.deleteMany({});
      console.log(`    ✓ Deleted ${deletedBids.count} bids`);

      console.log("  → Deleting orders...");
      const deletedOrders = await prisma.order.deleteMany({});
      console.log(`    ✓ Deleted ${deletedOrders.count} orders`);

      console.log("  → Deleting preferred supplier rules...");
      const deletedRules = await prisma.preferredSupplierRule.deleteMany({});
      console.log(`    ✓ Deleted ${deletedRules.count} preferred supplier rules`);

      console.log("  → Deleting RFQs...");
      const deletedRFQs = await prisma.rFQ.deleteMany({});
      console.log(`    ✓ Deleted ${deletedRFQs.count} RFQs`);

      console.log("  → Deleting users...");
      const deletedUsers = await prisma.user.deleteMany({});
      console.log(`    ✓ Deleted ${deletedUsers.count} users`);
    }
    
    console.log("");

    // TASK 3: Verify clean state
    console.log("✅ TASK 3: Verifying clean state...");
    console.log("");

    const finalUserCount = await prisma.user.count();
    const finalRfqCount = await prisma.rFQ.count();
    const finalBidCount = await prisma.bid.count();
    const finalMessageCount = await prisma.message.count();
    const finalNotificationCount = await prisma.notification.count();
    const finalOrderCount = await prisma.order.count();
    const finalRuleCount = await prisma.preferredSupplierRule.count();

    console.log("Auth-related tables (AFTER deletion):");
    console.log(`  - User: ${finalUserCount} rows`);
    console.log(`  - RFQ: ${finalRfqCount} rows`);
    console.log(`  - Bid: ${finalBidCount} rows`);
    console.log(`  - Message: ${finalMessageCount} rows`);
    console.log(`  - Notification: ${finalNotificationCount} rows`);
    console.log(`  - Order: ${finalOrderCount} rows`);
    console.log(`  - PreferredSupplierRule: ${finalRuleCount} rows`);
    console.log("");

    // TASK E: Post-purge verification - explicitly print "User AFTER = 0"
    console.log("📊 Post-purge verification:");
    console.log(`   User AFTER = ${finalUserCount}`);
    if (finalUserCount === 0) {
      console.log("   ✅ User count is zero - purge successful");
    } else {
      console.log("   ❌ User count is NOT zero - purge failed");
    }
    console.log("");

    // TASK B.4: Exit non-zero if User count is not 0 after purge
    if (finalUserCount !== 0) {
      console.error("❌ ERROR: User count is not zero after deletion!");
      console.error(`   Expected: 0, Actual: ${finalUserCount}`);
      console.error("   Script will exit with error code 1");
      process.exit(1);
    }

    // Verify all tables are empty
    const allEmpty = 
      finalUserCount === 0 &&
      finalRfqCount === 0 &&
      finalBidCount === 0 &&
      finalMessageCount === 0 &&
      finalNotificationCount === 0 &&
      finalOrderCount === 0 &&
      finalRuleCount === 0;

    if (!allEmpty) {
      console.error("❌ ERROR: Some tables still contain data!");
      console.error("   Script will exit with error code 1");
      process.exit(1);
    }

    console.log("✅ All tables verified empty");
    console.log("");
    console.log("✅ Database wipe complete!");
    console.log("   - All users deleted");
    console.log("   - All RFQs, bids, orders, messages, notifications deleted");
    console.log("   - Database is now clean and ready for fresh sign-ups");
    console.log("   - NO old emails can sign in");
    console.log("");

    // Dev-only log as requested
    console.log("[AUTH_DB_WIPE_COMPLETE] { userCount: 0 }");
    console.log("");

    // TASK A: Write DB lock file after successful purge
    console.log("🔒 Writing DB lock file...");
    try {
      const fingerprint = getDatabaseFingerprint();
      const databaseUrl = process.env.DATABASE_URL || "";
      const urlHash = require("crypto").createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
      
      const lock = {
        host: fingerprint.host,
        port: fingerprint.port,
        db: fingerprint.database,
        schema: fingerprint.schema,
        databaseUrlHash: urlHash,
        createdAt: new Date().toISOString(),
      };

      const lockDir = resolve(process.cwd(), "scripts");
      if (!existsSync(lockDir)) {
        mkdirSync(lockDir, { recursive: true });
      }

      const lockFilePath = resolve(lockDir, ".agora-db-lock.json");
      writeFileSync(lockFilePath, JSON.stringify(lock, null, 2), "utf-8");
      console.log("   ✓ DB lock file written: scripts/.agora-db-lock.json");
      console.log(`   ✓ Lock fingerprint: ${fingerprint.host}:${fingerprint.port}/${fingerprint.database}`);
    } catch (lockError: any) {
      console.error("   ⚠️  WARNING: Failed to write DB lock file:", lockError?.message);
      console.error("   The purge completed, but the app may not detect DB consistency.");
    }
    console.log("");

    // TASK D: Clear cookies note
    console.log("📝 Next steps:");
    console.log("   1. Clear browser cookies (agora.auth) if still logged in");
    console.log("   2. Restart dev server: npm run dev");
    console.log("   3. Reload browser (or clear cookies manually)");
    console.log("   4. Sign up with a new email (e.g., michael...@gmail.com)");
    console.log("");

  } catch (error) {
    console.error("❌ Error during database wipe:", error);
    process.exit(1);
  } finally {
    // Disconnect Prisma client
    await prisma.$disconnect();
  }
}

purgeAuthData()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });

 * 
 * WARNING: This deletes ALL user data in the database.
 * Only run in development environment.
 * 
 * This script:
 * 1. Prints DB fingerprint (host, port, db) BEFORE deleting
 * 2. Lists all auth-related tables and their row counts
 * 3. Deletes ALL data from these tables (using TRUNCATE CASCADE if Postgres)
 * 4. Verifies clean state (zero users)
 * 5. Exits non-zero if User count is not 0 after purge
 * 
 * Usage: npm run purge:dev
 * 
 * Requires: DATABASE_URL environment variable from .env.local
 */

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

// Load environment variables from .env.local (same as Next.js)
config({ path: resolve(process.cwd(), ".env.local") });
// Also try .env as fallback
config({ path: resolve(process.cwd(), ".env") });

// Import shared fingerprint function (standalone version for script)
// We can't import from src/lib/dbFingerprint.ts because it has "server-only"
// So we duplicate the logic here to ensure consistency
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
      database: urlObj.pathname.replace(/^\//, "").split("?")[0], // Remove leading slash and query params
    };
    
    // Extract schema from query params if present
    const schemaParam = urlObj.searchParams.get("schema");
    if (schemaParam) {
      fingerprint.schema = schemaParam;
    }
    
    return fingerprint;
  } catch {
    return { host: "unknown", port: "unknown", database: "unknown" };
  }
}

async function purgeAuthData() {
  // TASK B: Hard safety guards
  // 1. Refuse to run if NODE_ENV !== "development"
  if (process.env.NODE_ENV !== "development") {
    console.error("❌ ERROR: Cannot purge auth data unless NODE_ENV=development!");
    console.error(`   Current NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
    console.error("   Run: NODE_ENV=development npm run purge:dev");
    process.exit(1);
  }

  // 2. Validate DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL environment variable is not set!");
    console.error("   Please set DATABASE_URL in .env.local or .env file");
    console.error("   Format: postgresql://user:password@host:port/dbname");
    process.exit(1);
  }

  // 3. Refuse to run if DATABASE_URL contains indicators of production
  const dbUrl = process.env.DATABASE_URL.toLowerCase();
  const productionIndicators = ["render.com", "supabase.co", "railway.app", "vercel.com", "heroku.com", "prod", "production"];
  const isProductionDb = productionIndicators.some(indicator => dbUrl.includes(indicator));
  
  if (isProductionDb) {
    console.error("❌ ERROR: DATABASE_URL appears to point to a production database!");
    console.error("   Production indicators found in DATABASE_URL");
    console.error("   This script can only run against development databases");
    process.exit(1);
  }

  // TASK A: Print DB fingerprint BEFORE deleting (for comparison with app)
  const dbFingerprint = getDatabaseFingerprint();
  const databaseUrl = process.env.DATABASE_URL || "";
  const urlHash = require("crypto").createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
  
  console.log("🗑️  FULL DATABASE ACCOUNT WIPE");
  console.log("=".repeat(50));
  console.log("");
  console.log("[PURGE_DB_FINGERPRINT]", {
    host: dbFingerprint.host,
    port: dbFingerprint.port,
    db: dbFingerprint.database,
    schema: dbFingerprint.schema,
    urlHash, // Hash of DATABASE_URL for consistency verification
    source: "purge-script",
  });
  console.log("");

  // Create standalone Prisma client for script (uses same DATABASE_URL as app)
  const prisma = new PrismaClient();

  try {
    // TASK 1: Identify and list auth-related tables
    console.log("📋 TASK 1: Identifying auth-related tables...");
    console.log("");

    const userCount = await prisma.user.count();
    const rfqCount = await prisma.rFQ.count();
    const bidCount = await prisma.bid.count();
    const messageCount = await prisma.message.count();
    const notificationCount = await prisma.notification.count();
    const orderCount = await prisma.order.count();
    const preferredSupplierRuleCount = await prisma.preferredSupplierRule.count();

    console.log("Auth-related tables (BEFORE deletion):");
    console.log(`  - User: ${userCount} rows`);
    console.log(`  - RFQ: ${rfqCount} rows`);
    console.log(`  - Bid: ${bidCount} rows`);
    console.log(`  - Message: ${messageCount} rows`);
    console.log(`  - Notification: ${notificationCount} rows`);
    console.log(`  - Order: ${orderCount} rows`);
    console.log(`  - PreferredSupplierRule: ${preferredSupplierRuleCount} rows`);
    console.log("");

    if (userCount === 0 && rfqCount === 0 && bidCount === 0 && messageCount === 0 && notificationCount === 0 && orderCount === 0 && preferredSupplierRuleCount === 0) {
      console.log("✅ Database is already clean (all tables empty).");
      console.log("[AUTH_DB_WIPE_COMPLETE] { userCount: 0 }");
      return;
    }

    // TASK 2: Wipe data (hard delete)
    console.log("🗑️  TASK 2: Deleting all data...");
    console.log("");

    // TASK B.3: Try TRUNCATE CASCADE for complete wipe (Postgres only)
    // This is faster and more thorough than DELETE
    try {
      console.log("  → Attempting TRUNCATE CASCADE (Postgres)...");
      await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE "Notification", "Message", "Bid", "Order", "PreferredSupplierRule", "RFQ", "User" CASCADE;
      `);
      console.log("    ✓ TRUNCATE CASCADE successful (all tables wiped)");
    } catch (truncateError: any) {
      // If TRUNCATE fails (e.g., not Postgres or permissions issue), fall back to DELETE
      console.log("    ⚠️  TRUNCATE CASCADE failed, falling back to DELETE...");
      console.log(`    Error: ${truncateError?.message || String(truncateError)}`);
      
      // Delete in order to respect foreign key constraints
      console.log("  → Deleting notifications...");
      const deletedNotifications = await prisma.notification.deleteMany({});
      console.log(`    ✓ Deleted ${deletedNotifications.count} notifications`);

      console.log("  → Deleting messages...");
      const deletedMessages = await prisma.message.deleteMany({});
      console.log(`    ✓ Deleted ${deletedMessages.count} messages`);

      console.log("  → Deleting bids...");
      const deletedBids = await prisma.bid.deleteMany({});
      console.log(`    ✓ Deleted ${deletedBids.count} bids`);

      console.log("  → Deleting orders...");
      const deletedOrders = await prisma.order.deleteMany({});
      console.log(`    ✓ Deleted ${deletedOrders.count} orders`);

      console.log("  → Deleting preferred supplier rules...");
      const deletedRules = await prisma.preferredSupplierRule.deleteMany({});
      console.log(`    ✓ Deleted ${deletedRules.count} preferred supplier rules`);

      console.log("  → Deleting RFQs...");
      const deletedRFQs = await prisma.rFQ.deleteMany({});
      console.log(`    ✓ Deleted ${deletedRFQs.count} RFQs`);

      console.log("  → Deleting users...");
      const deletedUsers = await prisma.user.deleteMany({});
      console.log(`    ✓ Deleted ${deletedUsers.count} users`);
    }
    
    console.log("");

    // TASK 3: Verify clean state
    console.log("✅ TASK 3: Verifying clean state...");
    console.log("");

    const finalUserCount = await prisma.user.count();
    const finalRfqCount = await prisma.rFQ.count();
    const finalBidCount = await prisma.bid.count();
    const finalMessageCount = await prisma.message.count();
    const finalNotificationCount = await prisma.notification.count();
    const finalOrderCount = await prisma.order.count();
    const finalRuleCount = await prisma.preferredSupplierRule.count();

    console.log("Auth-related tables (AFTER deletion):");
    console.log(`  - User: ${finalUserCount} rows`);
    console.log(`  - RFQ: ${finalRfqCount} rows`);
    console.log(`  - Bid: ${finalBidCount} rows`);
    console.log(`  - Message: ${finalMessageCount} rows`);
    console.log(`  - Notification: ${finalNotificationCount} rows`);
    console.log(`  - Order: ${finalOrderCount} rows`);
    console.log(`  - PreferredSupplierRule: ${finalRuleCount} rows`);
    console.log("");

    // TASK E: Post-purge verification - explicitly print "User AFTER = 0"
    console.log("📊 Post-purge verification:");
    console.log(`   User AFTER = ${finalUserCount}`);
    if (finalUserCount === 0) {
      console.log("   ✅ User count is zero - purge successful");
    } else {
      console.log("   ❌ User count is NOT zero - purge failed");
    }
    console.log("");

    // TASK B.4: Exit non-zero if User count is not 0 after purge
    if (finalUserCount !== 0) {
      console.error("❌ ERROR: User count is not zero after deletion!");
      console.error(`   Expected: 0, Actual: ${finalUserCount}`);
      console.error("   Script will exit with error code 1");
      process.exit(1);
    }

    // Verify all tables are empty
    const allEmpty = 
      finalUserCount === 0 &&
      finalRfqCount === 0 &&
      finalBidCount === 0 &&
      finalMessageCount === 0 &&
      finalNotificationCount === 0 &&
      finalOrderCount === 0 &&
      finalRuleCount === 0;

    if (!allEmpty) {
      console.error("❌ ERROR: Some tables still contain data!");
      console.error("   Script will exit with error code 1");
      process.exit(1);
    }

    console.log("✅ All tables verified empty");
    console.log("");
    console.log("✅ Database wipe complete!");
    console.log("   - All users deleted");
    console.log("   - All RFQs, bids, orders, messages, notifications deleted");
    console.log("   - Database is now clean and ready for fresh sign-ups");
    console.log("   - NO old emails can sign in");
    console.log("");

    // Dev-only log as requested
    console.log("[AUTH_DB_WIPE_COMPLETE] { userCount: 0 }");
    console.log("");

    // TASK A: Write DB lock file after successful purge
    console.log("🔒 Writing DB lock file...");
    try {
      const fingerprint = getDatabaseFingerprint();
      const databaseUrl = process.env.DATABASE_URL || "";
      const urlHash = require("crypto").createHash("sha256").update(databaseUrl).digest("hex").substring(0, 10);
      
      const lock = {
        host: fingerprint.host,
        port: fingerprint.port,
        db: fingerprint.database,
        schema: fingerprint.schema,
        databaseUrlHash: urlHash,
        createdAt: new Date().toISOString(),
      };

      const lockDir = resolve(process.cwd(), "scripts");
      if (!existsSync(lockDir)) {
        mkdirSync(lockDir, { recursive: true });
      }

      const lockFilePath = resolve(lockDir, ".agora-db-lock.json");
      writeFileSync(lockFilePath, JSON.stringify(lock, null, 2), "utf-8");
      console.log("   ✓ DB lock file written: scripts/.agora-db-lock.json");
      console.log(`   ✓ Lock fingerprint: ${fingerprint.host}:${fingerprint.port}/${fingerprint.database}`);
    } catch (lockError: any) {
      console.error("   ⚠️  WARNING: Failed to write DB lock file:", lockError?.message);
      console.error("   The purge completed, but the app may not detect DB consistency.");
    }
    console.log("");

    // TASK D: Clear cookies note
    console.log("📝 Next steps:");
    console.log("   1. Clear browser cookies (agora.auth) if still logged in");
    console.log("   2. Restart dev server: npm run dev");
    console.log("   3. Reload browser (or clear cookies manually)");
    console.log("   4. Sign up with a new email (e.g., michael...@gmail.com)");
    console.log("");

  } catch (error) {
    console.error("❌ Error during database wipe:", error);
    process.exit(1);
  } finally {
    // Disconnect Prisma client
    await prisma.$disconnect();
  }
}

purgeAuthData()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
