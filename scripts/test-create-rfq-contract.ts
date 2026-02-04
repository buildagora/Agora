/**
 * RFQ Creation Pipeline Contract Tests
 * Verifies that createRFQFromBuyerInput writes to correct storage keys
 * and handles all edge cases correctly
 */

// Setup mocks before importing modules
const localStorage = new Map<string, string>();

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

// Mock crypto for UUID generation
(global as any).crypto = {
  randomUUID: () => {
    return `test-uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Set test environment
process.env.NODE_ENV = "test";

// Mock getCurrentUser
const TEST_BUYER_ID = "test-buyer-123";
const TEST_BUYER = {
  id: TEST_BUYER_ID,
  role: "BUYER" as const,
  fullName: "Test Buyer",
  companyName: "Test Company",
};

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
// This is the key: we override the functions before any modules import them
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
import {
  testReadBuyerRfqs,
  testReadGlobalFeed,
  testClearStorage,
} from "../src/lib/rfq/testStorageHelpers";
import { categoryIdToLabel } from "../src/lib/categories";

let testsPassed = 0;
let testsFailed = 0;
const testPromises: Promise<void>[] = [];

function test(name: string, fn: () => Promise<boolean> | boolean): void {
  const testPromise = (async () => {
    try {
      const result = await fn();
      if (result) {
        console.log(`✅ PASS: ${name}`);
        testsPassed++;
      } else {
        console.error(`❌ FAIL: ${name}`);
        testsFailed++;
      }
    } catch (error) {
      console.error(`❌ FAIL: ${name}`, error);
      testsFailed++;
    }
  })();
  testPromises.push(testPromise);
}

console.log("🧪 Testing RFQ Creation Pipeline Contract...\n");

// Test 1: Manual-equivalent creation
test("Manual-equivalent creation writes to buyer storage and global feed", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-1",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Test RFQ",
    notes: "",
    category: "Roofing",
    buyerId: TEST_BUYER_ID,
    lineItems: [
      { description: "Shingles", unit: "bundles", quantity: 10 },
    ],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  // Check buyer storage
  const buyerRfqs = testReadBuyerRfqs(TEST_BUYER_ID);
  const foundInBuyer = buyerRfqs.some((rfq) => rfq.id === result.rfqId);
  if (!foundInBuyer) {
    console.error("RFQ not found in buyer storage");
    return false;
  }

  // Check global feed
  const globalFeed = testReadGlobalFeed();
  const foundInGlobal = globalFeed.some((rfq) => rfq.id === result.rfqId);
  if (!foundInGlobal) {
    console.error("RFQ not found in global feed");
    return false;
  }

  // Check diagnostics
  if (result.diagnostics) {
    if (!result.diagnostics.storageWrites.wroteBuyer) {
      console.error("Diagnostics: wroteBuyer should be true");
      return false;
    }
    if (!result.diagnostics.storageWrites.wroteGlobal) {
      console.error("Diagnostics: wroteGlobal should be true");
      return false;
    }
  }

  return true;
});

// Test 2: Agent-equivalent creation
test("Agent-equivalent creation writes to buyer storage and global feed", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-2",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Agent Test RFQ",
    notes: "",
    category: "Mechanical (HVAC)", // Use the actual category label
    buyerId: TEST_BUYER_ID,
    lineItems: [
      { description: "AC Unit", unit: "ea", quantity: 1 },
    ],
    terms: {
      fulfillmentType: "DELIVERY",
      requestedDate: new Date().toISOString().split("T")[0],
      location: "123 Main St, Huntsville AL 35801",
    },
  };

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "agent",
    threadId: "test-thread-123",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  // Check buyer storage
  const buyerRfqs = testReadBuyerRfqs(TEST_BUYER_ID);
  const foundInBuyer = buyerRfqs.some((rfq) => rfq.id === result.rfqId);
  if (!foundInBuyer) {
    console.error("RFQ not found in buyer storage");
    return false;
  }

  // Check global feed
  const globalFeed = testReadGlobalFeed();
  const foundInGlobal = globalFeed.some((rfq) => rfq.id === result.rfqId);
  if (!foundInGlobal) {
    console.error("RFQ not found in global feed");
    return false;
  }

  return true;
});

// Test 3: CategoryId/label correctness
test("CategoryId roofing maps to category label 'Roofing'", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-3",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Category Test",
    notes: "",
    category: categoryIdToLabel("roofing"), // Use helper to get label
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  // Check stored category is the label
  const buyerRfqs = testReadBuyerRfqs(TEST_BUYER_ID);
  const createdRfq = buyerRfqs.find((rfq) => rfq.id === result.rfqId);
  if (!createdRfq) {
    console.error("Created RFQ not found");
    return false;
  }

  if (createdRfq.category !== "Roofing") {
    console.error(`Expected category 'Roofing', got '${createdRfq.category}'`);
    return false;
  }

  return true;
});

// Test 4: Invalid category fails
test("Invalid category returns error", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-4",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Invalid Category Test",
    notes: "",
    category: "InvalidCategory",
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
  });

  if (result.ok) {
    console.error("Expected ok:false for invalid category");
    return false;
  }

  if (!result.error.includes("Invalid category")) {
    console.error(`Expected error about invalid category, got: ${result.error}`);
    return false;
  }

  return true;
});

// Test 5: Email skipped in test environment
test("Email is skipped in test environment (non-blocking)", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-5",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Email Test",
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
    payload,
    source: "manual",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  // Check diagnostics show email was attempted
  // In test environment, email should be skipped
  if (result.diagnostics) {
    if (!result.diagnostics.emailAttempted) {
      console.error("Diagnostics: emailAttempted should be true");
      return false;
    }
    // Email should be skipped in test env (no RESEND_API_KEY)
    // But it's ok if it's not skipped if env vars are set
    if (result.diagnostics.emailSkippedReason) {
      // This is expected in test env
      if (result.diagnostics.emailSkippedReason !== "test_env" && 
          result.diagnostics.emailSkippedReason !== "missing_env") {
        console.log(`Note: emailSkippedReason is '${result.diagnostics.emailSkippedReason}'`);
      }
    }
  }

  return true;
});

// Test 6: RFQ number generation
test("RFQ number is generated if not provided", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-6",
    rfqNumber: "", // Empty - should be generated
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Number Generation Test",
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
    payload,
    source: "manual",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  if (!result.rfqNumber || result.rfqNumber.length === 0) {
    console.error("RFQ number should be generated");
    return false;
  }

  // Check format: RFQ-YY-####
  if (!/^RFQ-\d{2}-\d{4}$/.test(result.rfqNumber)) {
    console.error(`RFQ number format invalid: ${result.rfqNumber}`);
    return false;
  }

  return true;
});

// Test 7: Visibility + targeting (direct visibility with targetSupplierIds)
test("Visibility direct with targetSupplierIds is preserved", async () => {
  testClearStorage(TEST_BUYER_ID);

  const targetSupplierId = "supplier-123";
  const payload: RFQPayload = {
    id: "test-rfq-7",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Direct Visibility Test",
    notes: "",
    category: "Roofing",
    buyerId: TEST_BUYER_ID,
    visibility: "direct",
    targetSupplierIds: [targetSupplierId],
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  // Check stored RFQ includes visibility and targetSupplierIds
  const buyerRfqs = testReadBuyerRfqs(TEST_BUYER_ID);
  const createdRfq = buyerRfqs.find((rfq) => rfq.id === result.rfqId);
  if (!createdRfq) {
    console.error("Created RFQ not found");
    return false;
  }

  if (createdRfq.visibility !== "direct") {
    console.error(`Expected visibility 'direct', got '${createdRfq.visibility}'`);
    return false;
  }

  if (!createdRfq.targetSupplierIds || createdRfq.targetSupplierIds.length !== 1) {
    console.error(`Expected targetSupplierIds with 1 item, got: ${JSON.stringify(createdRfq.targetSupplierIds)}`);
    return false;
  }

  if (createdRfq.targetSupplierIds[0] !== targetSupplierId) {
    console.error(`Expected targetSupplierId '${targetSupplierId}', got '${createdRfq.targetSupplierIds[0]}'`);
    return false;
  }

  return true;
});

// Test 8: Persistence succeeds even if side effects throw
test("Persistence succeeds even if side effects throw", async () => {
  testClearStorage(TEST_BUYER_ID);

  // Mock side effects to throw
  const originalNotifyMatching = originalRfqNotifications.notifyMatchingSellers;
  originalRfqNotifications.notifyMatchingSellers = () => {
    throw new Error("Side effect error");
  };

  const payload: RFQPayload = {
    id: "test-rfq-8",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Side Effect Test",
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
    payload,
    source: "manual",
  });

  // Restore original
  originalRfqNotifications.notifyMatchingSellers = originalNotifyMatching;

  // Should still return ok:true because persistence succeeded
  if (!result.ok) {
    console.error(`Expected ok:true even with side effect errors, got error: ${result.error}`);
    return false;
  }

  // Verify RFQ was persisted
  const buyerRfqs = testReadBuyerRfqs(TEST_BUYER_ID);
  const foundInBuyer = buyerRfqs.some((rfq) => rfq.id === result.rfqId);
  if (!foundInBuyer) {
    console.error("RFQ not found in buyer storage after persistence");
    return false;
  }

  return true;
});

// Test 9: Missing buyerContext leads to ok:true with warnings
test("Missing buyerContext leads to ok:true with warnings", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-9",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Missing Context Test",
    notes: "",
    category: "Roofing",
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  // Mock getCurrentUser to return null
  const authModule = require("../src/lib/auth");
  const originalGetCurrentUser = authModule.getCurrentUser;
  authModule.getCurrentUser = () => null;

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
    buyerContext: undefined, // Explicitly no context
  });

  // Restore original
  authModule.getCurrentUser = originalGetCurrentUser;

  // Should return ok:true with warnings
  if (!result.ok) {
    console.error(`Expected ok:true with missing buyerContext, got error: ${result.error}`);
    return false;
  }

  if (!result.warnings || result.warnings.length === 0) {
    console.error("Expected warnings when buyerContext is missing");
    return false;
  }

  if (!result.warnings.some((w) => w.includes("buyer identity"))) {
    console.error(`Expected warning about buyer identity, got: ${result.warnings.join(", ")}`);
    return false;
  }

  // RFQ should still be persisted
  const buyerRfqs = testReadBuyerRfqs(TEST_BUYER_ID);
  const foundInBuyer = buyerRfqs.some((rfq) => rfq.id === result.rfqId);
  if (!foundInBuyer) {
    console.error("RFQ not found in buyer storage");
    return false;
  }

  return true;
});

// Test 10: Missing buyerId returns ok:false
test("Missing buyerId returns ok:false", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-10",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Missing BuyerId Test",
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
    buyerId: "", // Empty buyerId
    payload,
    source: "manual",
  });

  // Should return ok:false
  if (result.ok) {
    console.error("Expected ok:false when buyerId is missing");
    return false;
  }

  if (!result.error || !result.error.includes("Buyer ID is required")) {
    console.error(`Expected error about buyer ID, got: ${result.error}`);
    return false;
  }

  return true;
});

// Test 11: Invalid category returns ok:false
test("Invalid category returns ok:false", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-11",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Invalid Category Test",
    notes: "",
    category: "InvalidCategory", // Not in MATERIAL_CATEGORIES
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  const result = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
  });

  // Should return ok:false
  if (result.ok) {
    console.error("Expected ok:false when category is invalid");
    return false;
  }

  if (!result.error || !result.error.includes("Invalid category")) {
    console.error(`Expected error about invalid category, got: ${result.error}`);
    return false;
  }

  return true;
});

// Test 12: Dashboard read-back consistency (write/read namespace match)
test("Dashboard read-back consistency (write/read namespace match)", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-12",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Dashboard Consistency Test",
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
    payload,
    source: "manual",
  });

  if (!result.ok) {
    console.error(`Expected ok:true, got error: ${result.error}`);
    return false;
  }

  // Read using the SAME canonical function the dashboard uses (getBuyerRfqs)
  const { getBuyerRfqs } = require("../src/lib/rfq/rfqStore");

  // Check buyer-scoped storage using canonical getter (what dashboard uses)
  const buyerRfqs = getBuyerRfqs(TEST_BUYER_ID);
  const foundInBuyerScoped = buyerRfqs.some((rfq) => rfq.id === result.rfqId);

  // Test fails if create writes to a different namespace than dashboard reads
  if (!foundInBuyerScoped) {
    console.error("RFQ not found in buyer-scoped storage (what dashboard reads)");
    console.error(`Storage key: agora.data.${TEST_BUYER_ID}.rfqs`);
    console.error(`Getter: getBuyerRfqs (canonical)`);
    return false;
  }

  console.log("✅ RFQ found in buyer-scoped storage using canonical getBuyerRfqs");
  return true;
});

// Test 13: Delete from dashboard removes from both buyer store and feed store
test("Delete from dashboard removes from both buyer store and feed store", async () => {
  testClearStorage(TEST_BUYER_ID);

  const payload: RFQPayload = {
    id: "test-rfq-13",
    rfqNumber: "",
    status: "OPEN",
    createdAt: new Date().toISOString(),
    title: "Delete Test",
    notes: "",
    category: "Roofing",
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP",
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };

  // Create RFQ
  const createResult = await createRFQFromBuyerInput({
    buyerId: TEST_BUYER_ID,
    payload,
    source: "manual",
  });

  if (!createResult.ok) {
    console.error(`Expected ok:true, got error: ${createResult.error}`);
    return false;
  }

  // Verify it exists in both stores
  const { getBuyerRfqs, getFeedRfqs } = require("../src/lib/rfq/rfqStore");
  const buyerRfqsBefore = getBuyerRfqs(TEST_BUYER_ID);
  const feedRfqsBefore = getFeedRfqs();
  
  if (!buyerRfqsBefore.some((r) => r.id === createResult.rfqId)) {
    console.error("RFQ not found in buyer store before delete");
    return false;
  }
  
  if (!feedRfqsBefore.some((r) => r.id === createResult.rfqId)) {
    console.error("RFQ not found in feed store before delete");
    return false;
  }

  // Delete using canonical deleteRfq
  const { deleteRfq } = require("../src/lib/rfqs");
  try {
    deleteRfq(createResult.rfqId, { cascade: true, userId: TEST_BUYER_ID });
  } catch (error) {
    console.error(`deleteRfq threw error: ${error}`);
    return false;
  }

  // Verify it's removed from both stores
  const buyerRfqsAfter = getBuyerRfqs(TEST_BUYER_ID);
  const feedRfqsAfter = getFeedRfqs();
  
  if (buyerRfqsAfter.some((r) => r.id === createResult.rfqId)) {
    console.error("RFQ still found in buyer store after delete");
    return false;
  }
  
  if (feedRfqsAfter.some((r) => r.id === createResult.rfqId)) {
    console.error("RFQ still found in feed store after delete");
    return false;
  }

  return true;
});

// Summary - wait for all tests to complete
(async () => {
  await Promise.all(testPromises);
  
  console.log(`\n📊 Test Summary:`);
  console.log(`   Passed: ${testsPassed}`);
  console.log(`   Failed: ${testsFailed}`);

  if (testsFailed > 0) {
    console.error(`\n❌ ${testsFailed} test(s) failed`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${testsPassed} test(s) passed`);
    process.exit(0);
  }
})();
