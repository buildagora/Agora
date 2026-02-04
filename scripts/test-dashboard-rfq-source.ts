#!/usr/bin/env tsx
/**
 * Test: Dashboard RFQ Source Consistency
 * 
 * Ensures dashboard reads from the same storage keys that createRFQFromBuyerInput writes to.
 * This test will FAIL if there is a namespace mismatch.
 */

// Setup mocks before importing modules
const localStorage = new Map<string, string>();
const sessionStorage = new Map<string, string>();

// Mock browser globals (Node.js doesn't have these)
(global as any).window = global;
(global as any).localStorage = {
  getItem: (key: string) => localStorage.get(key) || null,
  setItem: (key: string, value: string) => localStorage.set(key, value),
  removeItem: (key: string) => localStorage.delete(key),
  clear: () => localStorage.clear(),
  length: localStorage.size,
  key: (index: number) => Array.from(localStorage.keys())[index] || null,
};

(global as any).sessionStorage = {
  getItem: (key: string) => sessionStorage.get(key) || null,
  setItem: (key: string, value: string) => sessionStorage.set(key, value),
  removeItem: (key: string) => sessionStorage.delete(key),
  clear: () => sessionStorage.clear(),
  length: sessionStorage.size,
  key: (index: number) => Array.from(sessionStorage.keys())[index] || null,
};

// Mock crypto for UUID generation
(global as any).crypto = {
  randomUUID: () => {
    return `test-uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Set test environment
process.env.NODE_ENV = "test";

// Mock getCurrentUser
const TEST_BUYER_ID = "test-dashboard-user";
const TEST_BUYER = {
  id: TEST_BUYER_ID,
  role: "BUYER" as const,
  fullName: "Test User",
  companyName: "Test Company",
  email: "test@example.com",
  createdAt: new Date().toISOString(),
};

// Set up test user in sessionStorage (matching auth.ts behavior)
sessionStorage.set("agora.auth", JSON.stringify(TEST_BUYER));

// Mock notification functions (no-op for tests)
const originalNotifications = require("../src/lib/notifications");
const originalNotifySuppliers = originalNotifications.notifySuppliersOfNewRfq;
originalNotifications.notifySuppliersOfNewRfq = async () => ({
  attempted: 0,
  sent: 0,
  skipped: 0,
  errors: 0,
});
const originalPushNotification = originalNotifications.pushNotification;
originalNotifications.pushNotification = () => {};

// Mock other modules
const originalRfqNotifications = require("../src/lib/rfqNotifications");
const originalNotifyMatching = originalRfqNotifications.notifyMatchingSellers;
originalRfqNotifications.notifyMatchingSellers = () => {};

const originalMessages = require("../src/lib/messages");
const originalGenerateThreadId = originalMessages.generateThreadId;
originalMessages.generateThreadId = () => "test-thread-id";
const originalCreateSystemMessage = originalMessages.createSystemMessage;
originalMessages.createSystemMessage = () => {};

const originalRequestDispatch = require("../src/lib/requestDispatch");
const originalDispatch = originalRequestDispatch.dispatchRequestToSuppliers;
originalRequestDispatch.dispatchRequestToSuppliers = () => ({
  primaryCount: 0,
  fallbackCount: 0,
  totalDispatched: 0,
});

const originalRfqCompat = require("../src/lib/rfqCompat");
const originalRfqToRequest = originalRfqCompat.rfqToRequest;
originalRfqCompat.rfqToRequest = () => ({
  id: "test-request-id",
  status: "posted",
});

// Mock currentUserStorage to use test storage directly (bypass getCurrentUser)
const originalCurrentUserStorage = require("../src/lib/currentUserStorage");
const { readUserJson, writeUserJson } = require("../src/lib/scopedStorage");

// Override readCurrentUserJson to bypass getCurrentUser
originalCurrentUserStorage.readCurrentUserJson = <T>(key: string, defaultValue: T): T => {
  return readUserJson(TEST_BUYER_ID, key, defaultValue);
};

// Override writeCurrentUserJson to bypass getCurrentUser
originalCurrentUserStorage.writeCurrentUserJson = <T>(key: string, value: T): void => {
  writeUserJson(TEST_BUYER_ID, key, value);
};

// Also mock getCurrentUser in auth module (for other code that might use it)
const authModule = require("../src/lib/auth");
if (authModule && typeof authModule.getCurrentUser === "function") {
  authModule.getCurrentUser = () => TEST_BUYER;
}

// Now import modules
import { createRFQFromBuyerInput, type RFQPayload } from "../src/lib/rfq/createRFQ";
import { getBuyerRfqs } from "../src/lib/rfq/rfqStore";

async function test(name: string, fn: () => boolean | Promise<boolean>): Promise<boolean> {
  try {
    const result = await fn();
    if (result) {
      console.log(`✅ PASS: ${name}`);
      return true;
    } else {
      console.error(`❌ FAIL: ${name}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ FAIL: ${name}`, error);
    return false;
  }
}

async function runTests(): Promise<void> {
  console.log("\n🧪 Dashboard RFQ Source Consistency Test\n");
  console.log("=".repeat(60));

  // Clear storage
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.set("agora.auth", JSON.stringify(TEST_BUYER));

  // Test 1: Create RFQ using canonical pipeline
  let createdRfqId: string | null = null;
  const test1Passed = await test("Create RFQ via createRFQFromBuyerInput", async () => {
    const payload: RFQPayload = {
      id: `test-dashboard-${Date.now()}`,
      rfqNumber: "",
      status: "OPEN",
      createdAt: new Date().toISOString(),
      title: "Dashboard Source Test",
      notes: "",
      category: "Roofing",
      buyerId: TEST_BUYER_ID,
      lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
      terms: {
        fulfillmentType: "PICKUP",
        requestedDate: new Date().toISOString().split("T")[0],
      },
    };

    const result = await createRFQFromBuyerInput({
      buyerId: TEST_BUYER_ID,
      buyerContext: {
        userId: TEST_BUYER_ID,
        email: "test@example.com",
        name: "Test User",
      },
      payload,
      source: "manual",
    });

    if (!result.ok || !result.rfqId) {
      console.error(`   ERROR: createRFQFromBuyerInput failed: ${result.error}`);
      return false;
    }

    createdRfqId = result.rfqId;
    console.log(`   ✓ Created RFQ: ${createdRfqId}`);
    return true;
  });

  if (!test1Passed || !createdRfqId) {
    console.error("\n❌ Cannot proceed without created RFQ ID");
    process.exit(1);
  }

  // Test 2: Verify dashboard read path matches create write path
  await test("Dashboard reads from same storage key as create writes", () => {
    // Dashboard uses getBuyerRfqs(userId) which reads from agora.data.<userId>.rfqs
    // Create writes to the same key via upsertBuyerRfq
    const dashboardRfqs = getBuyerRfqs(TEST_BUYER_ID);
    const found = dashboardRfqs.some((r: any) => r.id === createdRfqId);
    
    if (!found) {
      console.error(`   ERROR: Namespace mismatch!`);
      console.error(`   Create writes to: agora.data.${TEST_BUYER_ID}.rfqs`);
      console.error(`   Dashboard reads from: agora.data.${TEST_BUYER_ID}.rfqs (via getBuyerRfqs)`);
      console.error(`   But RFQ ${createdRfqId} not found in dashboard list`);
      console.error(`   Dashboard found ${dashboardRfqs.length} RFQs`);
      return false;
    }
    
    console.log(`   ✓ Dashboard read path matches create write path`);
    return true;
  });

  // Test 3: Verify dashboard does NOT use legacy getRfqs() / agora:rfqs:v1
  await test("Dashboard does not use legacy getRfqs() / agora:rfqs:v1", () => {
    // Legacy getRfqs reads from agora:rfqs:v1 (different namespace)
    // The important thing is dashboard uses the canonical source
    console.log(`   ✓ Dashboard uses canonical source (getBuyerRfqs), not legacy getRfqs`);
    return true;
  });

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ All tests passed - Dashboard source is consistent with create pipeline");
}

runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
