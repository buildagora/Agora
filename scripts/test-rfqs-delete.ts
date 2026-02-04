/**
 * Test script for RFQ deletion (legacy tolerance)
 * Run with: npm run test:rfqs-delete
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// Setup mocks before importing modules
const mockStorage = new Map<string, string>();

// Mock browser globals (Node.js doesn't have these)
(global as any).window = global;
(global as any).localStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void mockStorage.set(k, v),
  removeItem: (k: string) => void mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
  key: (index: number) => Array.from(mockStorage.keys())[index] || null,
};

// Mock crypto for UUID generation
(global as any).crypto = {
  randomUUID: () => {
    return `test-uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Set test environment
process.env.NODE_ENV = "test";

// Mock getCurrentUser BEFORE importing any modules that use it
const TEST_BUYER_ID = "test-buyer-123";
const TEST_BUYER = {
  id: TEST_BUYER_ID,
  role: "BUYER" as const,
  fullName: "Test Buyer",
  companyName: "Test Company",
};

// Mock auth module BEFORE any imports (must be done before rfqs module loads)
const authModule = require("../src/lib/auth");
const originalGetCurrentUser = authModule.getCurrentUser;
const originalGetAllUsers = authModule.getAllUsers;
// Use Object.defineProperty to override read-only exports
Object.defineProperty(authModule, "getCurrentUser", {
  value: () => TEST_BUYER,
  writable: true,
  configurable: true,
});
Object.defineProperty(authModule, "getAllUsers", {
  value: () => [TEST_BUYER],
  writable: true,
  configurable: true,
});

// Mock currentUserStorage to bypass getCurrentUser
const originalCurrentUserStorage = require("../src/lib/currentUserStorage");
const { readUserJson, writeUserJson, readGlobalJson, writeGlobalJson } = require("../src/lib/scopedStorage");

// Override readCurrentUserJson to bypass getCurrentUser
Object.defineProperty(originalCurrentUserStorage, "readCurrentUserJson", {
  value: function<T>(key: string, defaultValue: T): T {
    return readUserJson(TEST_BUYER_ID, key, defaultValue);
  },
  writable: true,
  configurable: true,
});

// Override writeCurrentUserJson to bypass getCurrentUser
Object.defineProperty(originalCurrentUserStorage, "writeCurrentUserJson", {
  value: function<T>(key: string, value: T): void {
    writeUserJson(TEST_BUYER_ID, key, value);
  },
  writable: true,
  configurable: true,
});

// Now import deleteRfq (it will use the mocked getCurrentUser)
const rfqsModule = require("../src/lib/rfqs");
const { deleteRfq } = rfqsModule;

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => boolean | void) {
  try {
    const result = fn();
    if (result === false) {
      console.error(`❌ FAIL: ${name}`);
      testsFailed++;
    } else {
      console.log(`✅ PASS: ${name}`);
      testsPassed++;
    }
  } catch (error) {
    console.error(`❌ FAIL: ${name}`, error);
    testsFailed++;
  }
}

console.log("🧪 Testing RFQ Deletion (Legacy Tolerance)...\n");

// Test 1: deleteRfq does not throw when global RFQ missing
test("deleteRfq does not throw when global RFQ missing", () => {
  // Clear storage
  mockStorage.clear();
  
  // Create RFQ in buyer storage only (not in global feed - legacy scenario)
  const rfq = {
    id: "test-rfq-legacy",
    rfqNumber: "RFQ-24-0001",
    status: "OPEN" as const,
    createdAt: new Date().toISOString(),
    title: "Legacy RFQ",
    notes: "",
    category: "Roofing",
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP" as const,
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };
  
  // Write to buyer storage only (using scopedStorage directly)
  writeUserJson(TEST_BUYER_ID, "rfqs", [rfq]);
  
  // Ensure global feed is empty
  writeGlobalJson("feed.rfqs", []);
  
  // Delete should not throw even though global RFQ is missing
  try {
    deleteRfq(rfq.id);
  } catch (error) {
    console.error(`deleteRfq threw error: ${error}`);
    return false;
  }
  
  // Verify RFQ was removed from buyer storage
  const buyerRfqs = readUserJson(TEST_BUYER_ID, "rfqs", [] as any[]);
  const found = buyerRfqs.find((r: any) => r.id === rfq.id);
  if (found) {
    console.error("RFQ should have been removed from buyer storage");
    return false;
  }
  
  return true;
});

// Test 2: deleteRfq handles RFQ in both storages
test("deleteRfq handles RFQ in both storages", () => {
  // Clear storage
  mockStorage.clear();
  
  const rfq = {
    id: "test-rfq-both",
    rfqNumber: "RFQ-24-0002",
    status: "OPEN" as const,
    createdAt: new Date().toISOString(),
    title: "Both Storages RFQ",
    notes: "",
    category: "Roofing",
    buyerId: TEST_BUYER_ID,
    lineItems: [{ description: "Test", unit: "ea", quantity: 1 }],
    terms: {
      fulfillmentType: "PICKUP" as const,
      requestedDate: new Date().toISOString().split("T")[0],
    },
  };
  
  // Write to both storages (using scopedStorage directly)
  writeUserJson(TEST_BUYER_ID, "rfqs", [rfq]);
  writeGlobalJson("feed.rfqs", [rfq]);
  
  // Delete should not throw
  try {
    deleteRfq(rfq.id);
  } catch (error) {
    console.error(`deleteRfq threw error: ${error}`);
    return false;
  }
  
  // Verify RFQ was removed from both storages
  const buyerRfqs = readUserJson(TEST_BUYER_ID, "rfqs", [] as any[]);
  const globalRfqs = readGlobalJson("feed.rfqs", [] as any[]);
  
  if (buyerRfqs.find((r: any) => r.id === rfq.id)) {
    console.error("RFQ should have been removed from buyer storage");
    return false;
  }
  
  if (globalRfqs.find((r: any) => r.id === rfq.id)) {
    console.error("RFQ should have been removed from global feed");
    return false;
  }
  
  return true;
});

// Test 3: deleteRfq handles RFQ not found in either storage (idempotent)
test("deleteRfq handles RFQ not found in either storage (idempotent)", () => {
  // Clear storage
  mockStorage.clear();
  
  // Try to delete non-existent RFQ - should not throw
  try {
    deleteRfq("non-existent-rfq-id");
  } catch (error) {
    console.error(`deleteRfq threw error for non-existent RFQ: ${error}`);
    return false;
  }
  
  return true;
});

// Summary
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
