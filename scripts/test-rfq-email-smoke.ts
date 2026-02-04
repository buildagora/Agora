/**
 * RFQ Email Notification Smoke Test
 * Tests that RFQ email notifications are sent correctly
 * 
 * Creates (or finds) a seller with a known email, creates a broadcast RFQ,
 * and calls the notification function to verify email sending.
 */

// CRITICAL: Load environment variables BEFORE any imports that depend on them
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "path";

// Ensure we're in the app directory
const appDir = resolve(__dirname, "..");
process.chdir(appDir);

// Load .env.local explicitly (dotenv/config loads .env by default)
const envLocalPath = resolve(appDir, ".env.local");
config({ path: envLocalPath, override: false }); // override: false to respect already-loaded vars

// Check for required env vars
if (!process.env.DATABASE_URL) {
  console.error("[ENV_MISSING] DATABASE_URL");
  console.error("Please set DATABASE_URL in .env.local or .env");
  process.exit(1);
}

// Now safe to import modules that depend on DATABASE_URL
import { getPrisma } from "../src/lib/db.server";
import { notifySellersOfNewRfq } from "../src/lib/rfq/notifySellers.server";

const TEST_SELLER_EMAIL = process.env.TEST_SELLER_EMAIL || "test-seller@example.com";
const TEST_CATEGORY = "lumber_siding"; // CategoryId that the test seller will serve (canonical id)

async function runRfqEmailSmokeTest() {
  console.log("--- Running RFQ Email Notification Smoke Test ---\n");

  // Ensure DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    console.error("[ENV_MISSING] DATABASE_URL");
    console.error("Please set DATABASE_URL in .env.local or .env");
    process.exit(1);
  }

  // Use getPrisma() from db.server.ts (canonical Prisma client)
  const prisma = getPrisma();

  try {
    // Step 1: Create or find a test seller
    console.log("1. Setting up test seller...");
    let seller = await prisma.user.findUnique({
      where: { email: TEST_SELLER_EMAIL },
    });

    if (!seller || seller.role !== "SELLER") {
      // Create test seller if doesn't exist or is not a seller
      const categoriesServed = JSON.stringify([TEST_CATEGORY]);
      
      if (seller) {
        // Update existing user to be a seller
        seller = await prisma.user.update({
          where: { id: seller.id },
          data: {
            role: "SELLER",
            categoriesServed,
            fullName: "Test Seller",
            companyName: "Test Seller Company",
          },
        });
      } else {
        // Create new seller
        seller = await prisma.user.create({
          data: {
            email: TEST_SELLER_EMAIL,
            passwordHash: "$2a$10$dummy", // Dummy hash for test
            role: "SELLER",
            categoriesServed,
            fullName: "Test Seller",
            companyName: "Test Seller Company",
          },
        });
      }
      console.log(`   ✅ Created/updated seller: ${seller.email} (ID: ${seller.id})`);
    } else {
      // Ensure seller has the test category
      let categories: string[] = [];
      try {
        if (seller.categoriesServed) {
          categories = JSON.parse(seller.categoriesServed);
        }
      } catch {
        // Invalid JSON, reset to empty
      }

      if (!categories.includes(TEST_CATEGORY)) {
        categories.push(TEST_CATEGORY);
        seller = await prisma.user.update({
          where: { id: seller.id },
          data: {
            categoriesServed: JSON.stringify(categories),
          },
        });
        console.log(`   ✅ Updated seller categories to include: ${TEST_CATEGORY}`);
      } else {
        console.log(`   ✅ Found existing seller: ${seller.email} (ID: ${seller.id})`);
      }
    }

    // Step 2: Create a test buyer (needed for RFQ creation)
    console.log("\n2. Setting up test buyer...");
    const TEST_BUYER_EMAIL = `test-buyer-${Date.now()}@example.com`;
    const buyer = await prisma.user.upsert({
      where: { email: TEST_BUYER_EMAIL },
      create: {
        email: TEST_BUYER_EMAIL,
        passwordHash: "$2a$10$dummy",
        role: "BUYER",
        fullName: "Test Buyer",
        companyName: "Test Buyer Company",
      },
      update: {},
    });
    console.log(`   ✅ Created/found buyer: ${buyer.email} (ID: ${buyer.id})`);

    // Step 3: Create a broadcast RFQ in the test category
    console.log("\n3. Creating broadcast RFQ...");
    const rfq = await prisma.rFQ.create({
      data: {
        rfqNumber: `RFQ-TEST-${Date.now()}`,
        status: "OPEN",
        title: "Test RFQ for Email Smoke Test",
        notes: "This is a test RFQ to verify email notifications",
        category: TEST_CATEGORY,
        buyerId: buyer.id,
        lineItems: JSON.stringify([
          { description: "Test item", unit: "pcs", quantity: 1 },
        ]),
        terms: JSON.stringify({
          fulfillmentType: "PICKUP",
          requestedDate: new Date().toISOString().split("T")[0],
        }),
        visibility: "broadcast",
      },
    });
    console.log(`   ✅ Created RFQ: ${rfq.rfqNumber} (ID: ${rfq.id})`);

    // Step 4: Call notification function
    console.log("\n4. Calling notifySellersOfNewRfq...");
    console.log(`   Created RFQ ID: ${rfq.id}`);
    
    // Check for DEV_EMAIL_OVERRIDE
    const devOverride = process.env.DEV_EMAIL_OVERRIDE;
    if (devOverride) {
      console.log(`   DEV_EMAIL_OVERRIDE: ${devOverride} (all emails will be sent to this address)`);
    }
    
    const stats = await notifySellersOfNewRfq({
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      category: rfq.category,
      title: rfq.title,
      notes: rfq.notes || undefined,
      createdAt: rfq.createdAt.toISOString(),
      terms: JSON.parse(rfq.terms),
      buyerName: buyer.fullName || buyer.companyName || undefined,
      visibility: "broadcast",
    });

    // Step 5: Verify results
    console.log("\n5. Verification:");
    console.log(`   Created RFQ ID: ${rfq.id}`);
    console.log(`   Notification Stats:`, stats);

    if (stats.attempted === 0) {
      console.error("   ❌ FAILED: No emails attempted");
      process.exit(1);
    }

    if (stats.sent === 0 && stats.errors === 0) {
      console.error("   ❌ FAILED: No emails sent and no errors (likely no matching sellers)");
      process.exit(1);
    }

    if (stats.errors > 0) {
      console.warn(`   ⚠️  WARNING: ${stats.errors} email(s) failed`);
      // Don't fail the test if there are errors, but log them
    }

    if (stats.sent > 0) {
      console.log(`   ✅ SUCCESS: ${stats.sent} email(s) sent successfully`);
    }

    // Step 6: Cleanup (optional - comment out if you want to keep test data)
    console.log("\n6. Cleanup...");
    await prisma.rFQ.delete({ where: { id: rfq.id } });
    await prisma.user.delete({ where: { id: buyer.id } });
    console.log("   ✅ Cleaned up test data");

    console.log("\n--- RFQ Email Notification Smoke Test Passed! ---");
  } catch (error) {
    console.error("\n--- RFQ Email Notification Smoke Test Failed! ---");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runRfqEmailSmokeTest().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


 * Tests that RFQ email notifications are sent correctly
 * 
 * Creates (or finds) a seller with a known email, creates a broadcast RFQ,
 * and calls the notification function to verify email sending.
 */

// CRITICAL: Load environment variables BEFORE any imports that depend on them
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "path";

// Ensure we're in the app directory
const appDir = resolve(__dirname, "..");
process.chdir(appDir);

// Load .env.local explicitly (dotenv/config loads .env by default)
const envLocalPath = resolve(appDir, ".env.local");
config({ path: envLocalPath, override: false }); // override: false to respect already-loaded vars

// Check for required env vars
if (!process.env.DATABASE_URL) {
  console.error("[ENV_MISSING] DATABASE_URL");
  console.error("Please set DATABASE_URL in .env.local or .env");
  process.exit(1);
}

// Now safe to import modules that depend on DATABASE_URL
import { getPrisma } from "../src/lib/db.server";
import { notifySellersOfNewRfq } from "../src/lib/rfq/notifySellers.server";

const TEST_SELLER_EMAIL = process.env.TEST_SELLER_EMAIL || "test-seller@example.com";
const TEST_CATEGORY = "lumber_siding"; // CategoryId that the test seller will serve (canonical id)

async function runRfqEmailSmokeTest() {
  console.log("--- Running RFQ Email Notification Smoke Test ---\n");

  // Ensure DATABASE_URL is available
  if (!process.env.DATABASE_URL) {
    console.error("[ENV_MISSING] DATABASE_URL");
    console.error("Please set DATABASE_URL in .env.local or .env");
    process.exit(1);
  }

  // Use getPrisma() from db.server.ts (canonical Prisma client)
  const prisma = getPrisma();

  try {
    // Step 1: Create or find a test seller
    console.log("1. Setting up test seller...");
    let seller = await prisma.user.findUnique({
      where: { email: TEST_SELLER_EMAIL },
    });

    if (!seller || seller.role !== "SELLER") {
      // Create test seller if doesn't exist or is not a seller
      const categoriesServed = JSON.stringify([TEST_CATEGORY]);
      
      if (seller) {
        // Update existing user to be a seller
        seller = await prisma.user.update({
          where: { id: seller.id },
          data: {
            role: "SELLER",
            categoriesServed,
            fullName: "Test Seller",
            companyName: "Test Seller Company",
          },
        });
      } else {
        // Create new seller
        seller = await prisma.user.create({
          data: {
            email: TEST_SELLER_EMAIL,
            passwordHash: "$2a$10$dummy", // Dummy hash for test
            role: "SELLER",
            categoriesServed,
            fullName: "Test Seller",
            companyName: "Test Seller Company",
          },
        });
      }
      console.log(`   ✅ Created/updated seller: ${seller.email} (ID: ${seller.id})`);
    } else {
      // Ensure seller has the test category
      let categories: string[] = [];
      try {
        if (seller.categoriesServed) {
          categories = JSON.parse(seller.categoriesServed);
        }
      } catch {
        // Invalid JSON, reset to empty
      }

      if (!categories.includes(TEST_CATEGORY)) {
        categories.push(TEST_CATEGORY);
        seller = await prisma.user.update({
          where: { id: seller.id },
          data: {
            categoriesServed: JSON.stringify(categories),
          },
        });
        console.log(`   ✅ Updated seller categories to include: ${TEST_CATEGORY}`);
      } else {
        console.log(`   ✅ Found existing seller: ${seller.email} (ID: ${seller.id})`);
      }
    }

    // Step 2: Create a test buyer (needed for RFQ creation)
    console.log("\n2. Setting up test buyer...");
    const TEST_BUYER_EMAIL = `test-buyer-${Date.now()}@example.com`;
    const buyer = await prisma.user.upsert({
      where: { email: TEST_BUYER_EMAIL },
      create: {
        email: TEST_BUYER_EMAIL,
        passwordHash: "$2a$10$dummy",
        role: "BUYER",
        fullName: "Test Buyer",
        companyName: "Test Buyer Company",
      },
      update: {},
    });
    console.log(`   ✅ Created/found buyer: ${buyer.email} (ID: ${buyer.id})`);

    // Step 3: Create a broadcast RFQ in the test category
    console.log("\n3. Creating broadcast RFQ...");
    const rfq = await prisma.rFQ.create({
      data: {
        rfqNumber: `RFQ-TEST-${Date.now()}`,
        status: "OPEN",
        title: "Test RFQ for Email Smoke Test",
        notes: "This is a test RFQ to verify email notifications",
        category: TEST_CATEGORY,
        buyerId: buyer.id,
        lineItems: JSON.stringify([
          { description: "Test item", unit: "pcs", quantity: 1 },
        ]),
        terms: JSON.stringify({
          fulfillmentType: "PICKUP",
          requestedDate: new Date().toISOString().split("T")[0],
        }),
        visibility: "broadcast",
      },
    });
    console.log(`   ✅ Created RFQ: ${rfq.rfqNumber} (ID: ${rfq.id})`);

    // Step 4: Call notification function
    console.log("\n4. Calling notifySellersOfNewRfq...");
    console.log(`   Created RFQ ID: ${rfq.id}`);
    
    // Check for DEV_EMAIL_OVERRIDE
    const devOverride = process.env.DEV_EMAIL_OVERRIDE;
    if (devOverride) {
      console.log(`   DEV_EMAIL_OVERRIDE: ${devOverride} (all emails will be sent to this address)`);
    }
    
    const stats = await notifySellersOfNewRfq({
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      category: rfq.category,
      title: rfq.title,
      notes: rfq.notes || undefined,
      createdAt: rfq.createdAt.toISOString(),
      terms: JSON.parse(rfq.terms),
      buyerName: buyer.fullName || buyer.companyName || undefined,
      visibility: "broadcast",
    });

    // Step 5: Verify results
    console.log("\n5. Verification:");
    console.log(`   Created RFQ ID: ${rfq.id}`);
    console.log(`   Notification Stats:`, stats);

    if (stats.attempted === 0) {
      console.error("   ❌ FAILED: No emails attempted");
      process.exit(1);
    }

    if (stats.sent === 0 && stats.errors === 0) {
      console.error("   ❌ FAILED: No emails sent and no errors (likely no matching sellers)");
      process.exit(1);
    }

    if (stats.errors > 0) {
      console.warn(`   ⚠️  WARNING: ${stats.errors} email(s) failed`);
      // Don't fail the test if there are errors, but log them
    }

    if (stats.sent > 0) {
      console.log(`   ✅ SUCCESS: ${stats.sent} email(s) sent successfully`);
    }

    // Step 6: Cleanup (optional - comment out if you want to keep test data)
    console.log("\n6. Cleanup...");
    await prisma.rFQ.delete({ where: { id: rfq.id } });
    await prisma.user.delete({ where: { id: buyer.id } });
    console.log("   ✅ Cleaned up test data");

    console.log("\n--- RFQ Email Notification Smoke Test Passed! ---");
  } catch (error) {
    console.error("\n--- RFQ Email Notification Smoke Test Failed! ---");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runRfqEmailSmokeTest().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

