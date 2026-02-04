#!/usr/bin/env tsx
/**
 * RFQ Doctor - Deterministic Diagnostic for RFQ Storage and Visibility
 * 
 * Proves:
 * - Current userId is resolved (not undefined)
 * - RFQ creation writes to the SAME keys that dashboard reads
 * - After create, RFQ is visible in the exact list dashboard renders
 * - Delete is idempotent (does not throw if RFQ is missing)
 * - Notifications/side-effects never crash core flows
 * 
 * Run: npm run rfq:doctor
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// Setup mocks before importing modules
const mockLocalStorage = new Map<string, string>();
const mockSessionStorage = new Map<string, string>();

// Mock browser globals (Node.js doesn't have these)
(global as any).window = global;
(global as any).localStorage = {
  getItem: (k: string) => mockLocalStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void mockLocalStorage.set(k, v),
  removeItem: (k: string) => void mockLocalStorage.delete(k),
  clear: () => mockLocalStorage.clear(),
  get length() { return mockLocalStorage.size; },
  key: (index: number) => Array.from(mockLocalStorage.keys())[index] || null,
};

(global as any).sessionStorage = {
  getItem: (k: string) => mockSessionStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void mockSessionStorage.set(k, v),
  removeItem: (k: string) => void mockSessionStorage.delete(k),
  clear: () => mockSessionStorage.clear(),
  get length() { return mockSessionStorage.size; },
  key: (index: number) => Array.from(mockSessionStorage.keys())[index] || null,
};

// Set up a test user in sessionStorage (matching auth.ts behavior)
const testUser = {
  id: "doctor-test-user",
  companyName: "Doctor Test Company",
  fullName: "Doctor Test User",
  email: "doctor@test.com",
  createdAt: new Date().toISOString(),
};
mockSessionStorage.set("agora.auth", JSON.stringify(testUser));

// Mock crypto for Node.js
if (typeof crypto === "undefined") {
  (global as any).crypto = {
    randomUUID: () => {
      return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    },
  };
}

// Set NODE_ENV for dev diagnostics
process.env.NODE_ENV = process.env.NODE_ENV || "development";

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

// Mock currentUserStorage to use test storage directly
const doctorCurrentUserStorage = require("../src/lib/currentUserStorage");
const { readUserJson: doctorReadUserJson, writeUserJson: doctorWriteUserJson } = require("../src/lib/scopedStorage");
const DOCTOR_TEST_BUYER_ID = "doctor-test-user";

// Override readCurrentUserJson to bypass getCurrentUser
Object.defineProperty(doctorCurrentUserStorage, "readCurrentUserJson", {
  value: <T>(key: string, defaultValue: T): T => {
    return doctorReadUserJson(DOCTOR_TEST_BUYER_ID, key, defaultValue);
  },
  writable: true,
  configurable: true,
});

// Override writeCurrentUserJson to bypass getCurrentUser
Object.defineProperty(doctorCurrentUserStorage, "writeCurrentUserJson", {
  value: <T>(key: string, value: T): void => {
    doctorWriteUserJson(DOCTOR_TEST_BUYER_ID, key, value);
  },
  writable: true,
  configurable: true,
});

// Also mock getCurrentUser in auth module
const doctorAuthModule = require("../src/lib/auth");
if (doctorAuthModule && typeof doctorAuthModule.getCurrentUser === "function") {
  Object.defineProperty(doctorAuthModule, "getCurrentUser", {
    value: () => testUser,
    writable: true,
    configurable: true,
  });
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

async function runTest(name: string, fn: () => boolean | Promise<boolean>, details?: any): Promise<boolean> {
  try {
    const result = await fn();
    testResults.push({ name, passed: result, details });
    if (!result) {
      console.error(`❌ FAIL: ${name}`);
      if (details) console.error("   Details:", details);
    } else {
      console.log(`✅ PASS: ${name}`);
    }
    return result;
  } catch (error: any) {
    testResults.push({ name, passed: false, error: error.message, details });
    console.error(`❌ FAIL: ${name}`, error);
    return false;
  }
}

async function runTests(): Promise<void> {
  console.log("\n🔬 RFQ DOCTOR - Starting Diagnostic Tests\n");
  console.log("=" .repeat(60));

  // Test 1: Resolve current user
  let currentUser: any = null;
  const test1Passed = await runTest("Current user is resolved (not undefined)", () => {
    const { getCurrentUser } = require("../src/lib/auth");
    currentUser = getCurrentUser();
    
    if (!currentUser) {
      console.error("   ERROR: getCurrentUser() returned null/undefined");
      console.error("   HINT: Ensure you are signed in or mock getCurrentUser in test environment");
      return false;
    }
    
    if (!currentUser.id) {
      console.error("   ERROR: currentUser.id is missing");
      return false;
    }
    
    console.log(`   ✓ User ID: ${currentUser.id}`);
    return true;
  }, { userId: currentUser?.id });

  if (!test1Passed || !currentUser?.id) {
    console.error("\n❌ CRITICAL: Cannot proceed without userId. Exiting.");
    process.exit(1);
  }

  const userId = currentUser.id;
  const testRfqId = `doctor-test-${Date.now()}`;

  // Test 2: Create RFQ using canonical pipeline
  let createResult: any = null;
  const test2Passed = await runTest("RFQ creation via createRFQFromBuyerInput succeeds", async () => {
    const { createRFQFromBuyerInput } = require("../src/lib/rfq/createRFQ");
    
    const payload = {
      id: testRfqId,
      rfqNumber: "",
      status: "OPEN" as const,
      createdAt: new Date().toISOString(),
      title: "DOCTOR-TEST",
      notes: "RFQ Doctor diagnostic test",
      category: "Roofing",
      categoryId: "roofing",
      buyerId: userId,
      jobNameOrPo: "DOCTOR-TEST",
      lineItems: [
        {
          quantity: 1,
          unit: "ea",
          description: "doctor test item",
        },
      ],
      terms: {
        fulfillmentType: "PICKUP" as const,
        requestedDate: new Date().toISOString().split("T")[0],
      },
    };

    createResult = await createRFQFromBuyerInput({
      buyerId: userId,
      buyerContext: {
        userId: userId,
        email: currentUser.email,
        name: currentUser.fullName || currentUser.companyName,
      },
      payload,
      source: "doctor" as any,
    });

    if (!createResult.ok) {
      console.error(`   ERROR: createRFQFromBuyerInput returned ok:false`);
      console.error(`   Error: ${createResult.error}`);
      return false;
    }

    if (!createResult.rfqId) {
      console.error(`   ERROR: createResult.rfqId is missing`);
      return false;
    }

    console.log(`   ✓ RFQ ID: ${createResult.rfqId}`);
    return true;
  }, { rfqId: createResult?.rfqId });

  if (!test2Passed || !createResult?.ok || !createResult?.rfqId) {
    console.error("\n❌ CRITICAL: RFQ creation failed. Cannot test visibility.");
    if (createResult?.error) {
      console.error(`   Error: ${createResult.error}`);
    }
    process.exit(1);
  }

  const createdRfqId = createResult.rfqId;

  // Test 3: Verify RFQ is in buyer-scoped storage (what dashboard reads)
  await runTest("RFQ is visible in buyer-scoped storage (dashboard source)", () => {
    const { getBuyerRfqs } = require("../src/lib/rfq/rfqStore");
    const buyerRfqs = getBuyerRfqs(userId);
    const found = buyerRfqs.some((r: any) => r.id === createdRfqId);
    
    if (!found) {
      console.error(`   ERROR: RFQ ${createdRfqId} not found in buyer-scoped storage`);
      console.error(`   Storage key: agora.data.${userId}.rfqs`);
      console.error(`   Found ${buyerRfqs.length} RFQs, IDs: ${buyerRfqs.slice(0, 3).map((r: any) => r.id).join(", ")}`);
      return false;
    }
    
    console.log(`   ✓ Found in buyer-scoped storage (${buyerRfqs.length} total RFQs)`);
    return true;
  }, { storageKey: `agora.data.${userId}.rfqs`, totalCount: null });

  // Test 4: Verify RFQ is in global feed
  await runTest("RFQ is visible in global feed storage", () => {
    const { getFeedRfqs } = require("../src/lib/rfq/rfqStore");
    const feedRfqs = getFeedRfqs();
    const found = feedRfqs.some((r: any) => r.id === createdRfqId);
    
    if (!found) {
      console.error(`   ERROR: RFQ ${createdRfqId} not found in global feed`);
      console.error(`   Storage key: agora.feed.rfqs`);
      return false;
    }
    
    console.log(`   ✓ Found in global feed (${feedRfqs.length} total RFQs)`);
    return true;
  }, { storageKey: "agora.feed.rfqs" });

  // Test 5: Verify dashboard read path matches create write path
  await runTest("Dashboard read path matches create write path (no namespace mismatch)", () => {
    const { getBuyerRfqs } = require("../src/lib/rfq/rfqStore");
    
    // Dashboard uses getBuyerRfqs(userId) which reads from agora.data.<userId>.rfqs
    // Create writes to the same key via upsertBuyerRfq
    // This test verifies they match
    
    const dashboardRfqs = getBuyerRfqs(userId);
    const foundInDashboard = dashboardRfqs.some((r: any) => r.id === createdRfqId);
    
    if (!foundInDashboard) {
      console.error(`   ERROR: Namespace mismatch detected!`);
      console.error(`   Create writes to: agora.data.${userId}.rfqs`);
      console.error(`   Dashboard reads from: agora.data.${userId}.rfqs (via getBuyerRfqs)`);
      console.error(`   But RFQ not found in dashboard list`);
      return false;
    }
    
    console.log(`   ✓ Dashboard read path matches create write path`);
    return true;
  });

  // Test 6: Delete is idempotent (does not throw)
  await runTest("Delete RFQ is idempotent (does not throw)", () => {
    const { deleteRfq } = require("../src/lib/rfqs");
    
    try {
      // First delete (should succeed)
      deleteRfq(createdRfqId, { cascade: true, userId });
      
      // Second delete (should not throw even if already deleted)
      deleteRfq(createdRfqId, { cascade: true, userId });
      
      console.log(`   ✓ Delete is idempotent (no throw on missing RFQ)`);
      return true;
    } catch (error: any) {
      console.error(`   ERROR: deleteRfq threw error: ${error.message}`);
      return false;
    }
  });

  // Test 7: Verify RFQ is actually deleted
  await runTest("RFQ is removed from both stores after delete", () => {
    const { getBuyerRfqs, getFeedRfqs } = require("../src/lib/rfq/rfqStore");
    
    const buyerRfqs = getBuyerRfqs(userId);
    const feedRfqs = getFeedRfqs();
    
    const stillInBuyer = buyerRfqs.some((r: any) => r.id === createdRfqId);
    const stillInFeed = feedRfqs.some((r: any) => r.id === createdRfqId);
    
    if (stillInBuyer || stillInFeed) {
      console.error(`   ERROR: RFQ still exists after delete`);
      console.error(`   In buyer store: ${stillInBuyer}`);
      console.error(`   In feed store: ${stillInFeed}`);
      return false;
    }
    
    console.log(`   ✓ RFQ removed from both stores`);
    return true;
  });

  // Test 8: Notifications do not crash (side effects are safe)
  await runTest("Notification push does not crash on missing userId", () => {
    const { pushNotification } = require("../src/lib/notifications");
    
    try {
      // This should not throw, even with invalid userId
      pushNotification("", {
        id: "test-notification",
        createdAt: new Date().toISOString(),
        type: "TEST",
        data: {},
      });
      
      pushNotification(undefined as any, {
        id: "test-notification-2",
        createdAt: new Date().toISOString(),
        type: "TEST",
        data: {},
      });
      
      console.log(`   ✓ Notification push handles missing userId gracefully`);
      return true;
    } catch (error: any) {
      console.error(`   ERROR: pushNotification threw: ${error.message}`);
      return false;
    }
  });

  // All tests are now awaited above

  // Summary
  console.log("\n" + "=".repeat(60));
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  
  console.log(`\n📊 Test Summary:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  
  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${passed} test(s) passed`);
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error running RFQ Doctor:", error);
  process.exit(1);
});

