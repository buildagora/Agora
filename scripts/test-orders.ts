/**
 * Lightweight tests for Order lifecycle logic
 * Tests: idempotency, status transitions, cancel rules, statusHistory
 */

// Mock browser globals for Node.js
const MOCK_DATE = "2024-01-15T10:00:00.000Z";
const MOCK_DATE_2 = "2024-01-15T11:00:00.000Z";
const MOCK_DATE_3 = "2024-01-15T12:00:00.000Z";

let dateCallCount = 0;
let uuidCounter = 0;

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  },
};

// Mock sessionStorage
const sessionStorage = {
  getItem: (key: string) => mockStorage[`session_${key}`] || null,
  setItem: (key: string, value: string) => {
    mockStorage[`session_${key}`] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[`session_${key}`];
  },
};

// Mock crypto.randomUUID
Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: () => {
      uuidCounter++;
      return `mock-uuid-${uuidCounter}`;
    },
  },
  configurable: true,
});

// Mock Date
class MockDate extends Date {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(MOCK_DATE);
    } else {
      super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    }
  }

  static now() {
    dateCallCount++;
    if (dateCallCount === 1) return new Date(MOCK_DATE).getTime();
    if (dateCallCount === 2) return new Date(MOCK_DATE_2).getTime();
    return new Date(MOCK_DATE_3).getTime();
  }

  toISOString() {
    dateCallCount++;
    if (dateCallCount === 1) return MOCK_DATE;
    if (dateCallCount === 2) return MOCK_DATE_2;
    return MOCK_DATE_3;
  }
}

(global as any).window = global;
(global as any).localStorage = localStorage;
(global as any).sessionStorage = sessionStorage;
(global as any).Date = MockDate as any;

// Import order helpers after mocks are set up
import { createOrderFromAward, updateOrderStatus, getOrderByRequestId } from "../src/lib/order";
import { type RFQRequest, type RequestItem, type DeliveryTerms } from "../src/lib/request";
import { type Quote } from "../src/lib/quote";

// Helper to create a mock request
function createMockRequest(id: string, buyerId: string): RFQRequest {
  return {
    id,
    buyerId,
    status: "posted",
    createdAt: MOCK_DATE,
    updatedAt: MOCK_DATE,
    delivery: {
      mode: "delivery",
      needBy: MOCK_DATE_2,
      address: "123 Main St, City, ST 12345",
    } as DeliveryTerms,
    items: [
      {
        id: "item-1",
        description: "Test item",
        category: "lumber",
        quantity: 10,
        unit: "ea",
      } as RequestItem,
    ],
  };
}

// Helper to create a mock quote
function createMockQuote(sellerId: string): Quote {
  return {
    requestId: "req-1",
    sellerId,
    priceSubtotal: 1000,
    deliveryFee: 50,
    tax: 0,
    totalPrice: 1050,
    leadTimeDays: 7,
    fulfillmentMode: "delivery",
    submittedAt: MOCK_DATE,
  };
}

// Helper assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn: () => void, expectedMessage?: string) {
  try {
    fn();
    throw new Error("Expected function to throw, but it didn't");
  } catch (error) {
    if (expectedMessage && !(error instanceof Error && error.message.includes(expectedMessage))) {
      throw new Error(
        `Expected error message to contain "${expectedMessage}", but got: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Reset state between tests
function resetState() {
  // Clear localStorage mock
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  // Clear sessionStorage mock (stored with session_ prefix)
  Object.keys(mockStorage).forEach((key) => {
    if (key.startsWith("session_")) {
      delete mockStorage[key];
    }
  });
  dateCallCount = 0;
  uuidCounter = 0;
}

// Test 1: createOrderFromAward idempotency (no duplicates)
function testCreateOrderIdempotency() {
  resetState();
  console.log("Test 1: createOrderFromAward idempotency");

  const request = createMockRequest("req-1", "buyer-1");
  const quote = createMockQuote("seller-1");

  // Create first order
  const order1 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });

  assert(order1 !== null, "First order should be created");
  assertEqual(order1.requestId, "req-1", "Order should have correct requestId");
  assertEqual(order1.status, "awarded", "Order should start with 'awarded' status");

  // Try to create duplicate order - should throw error
  assertThrows(
    () => {
      createOrderFromAward({
        request,
        quote,
        buyerId: "buyer-1",
      });
    },
    "already exists"
  );

  // Verify only one order exists
  const existingOrder = getOrderByRequestId("req-1", "buyer-1");
  assert(existingOrder !== null, "Order should exist");
  assertEqual(existingOrder!.id, order1.id, "Should be the same order");

  console.log("✓ createOrderFromAward idempotency test passed");
}

// Test 2: Status transition rules (forward-only)
function testStatusTransitions() {
  resetState();
  console.log("Test 2: Status transition rules (forward-only)");

  const request = createMockRequest("req-1", "buyer-1");
  const quote = createMockQuote("seller-1");

  // Create order
  const order = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });

  // Valid transitions
  // awarded -> confirmed
  const confirmedOrder = updateOrderStatus(order.id, "confirmed", "seller-1");
  assert(confirmedOrder !== null, "Should allow awarded -> confirmed");
  assertEqual(confirmedOrder!.status, "confirmed", "Status should be confirmed");

  // confirmed -> scheduled
  const scheduledOrder = updateOrderStatus(order.id, "scheduled", "seller-1");
  assert(scheduledOrder !== null, "Should allow confirmed -> scheduled");
  assertEqual(scheduledOrder!.status, "scheduled", "Status should be scheduled");

  // scheduled -> delivered
  const deliveredOrder = updateOrderStatus(order.id, "delivered", "seller-1");
  assert(deliveredOrder !== null, "Should allow scheduled -> delivered");
  assertEqual(deliveredOrder!.status, "delivered", "Status should be delivered");

  // Invalid transitions (should throw)
  // Try to go backwards: delivered -> scheduled
  assertThrows(
    () => {
      updateOrderStatus(order.id, "scheduled", "seller-1");
    },
    "Invalid status transition"
  );

  // Try to skip: delivered -> confirmed
  assertThrows(
    () => {
      updateOrderStatus(order.id, "confirmed", "seller-1");
    },
    "Invalid status transition"
  );

  console.log("✓ Status transition rules test passed");
}

// Test 3: Cancel rules
function testCancelRules() {
  resetState();
  console.log("Test 3: Cancel rules");

  const request = createMockRequest("req-1", "buyer-1");
  const quote = createMockQuote("seller-1");

  // Test 3a: Cancel from awarded
  resetState();
  const order1 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });
  const cancelledOrder1 = updateOrderStatus(order1.id, "cancelled", "buyer-1");
  assert(cancelledOrder1 !== null, "Should allow cancel from awarded");
  assertEqual(cancelledOrder1!.status, "cancelled", "Status should be cancelled");

  // Test 3b: Cancel from confirmed
  resetState();
  const order2 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });
  updateOrderStatus(order2.id, "confirmed", "seller-1");
  const cancelledOrder2 = updateOrderStatus(order2.id, "cancelled", "seller-1");
  assert(cancelledOrder2 !== null, "Should allow cancel from confirmed");
  assertEqual(cancelledOrder2!.status, "cancelled", "Status should be cancelled");

  // Test 3c: Cancel from scheduled
  resetState();
  const order3 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });
  updateOrderStatus(order3.id, "confirmed", "seller-1");
  updateOrderStatus(order3.id, "scheduled", "seller-1");
  const cancelledOrder3 = updateOrderStatus(order3.id, "cancelled", "seller-1");
  assert(cancelledOrder3 !== null, "Should allow cancel from scheduled");
  assertEqual(cancelledOrder3!.status, "cancelled", "Status should be cancelled");

  // Test 3d: Cannot cancel from delivered
  resetState();
  const order4 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });
  updateOrderStatus(order4.id, "confirmed", "seller-1");
  updateOrderStatus(order4.id, "scheduled", "seller-1");
  updateOrderStatus(order4.id, "delivered", "seller-1");
  
  assertThrows(
    () => {
      updateOrderStatus(order4.id, "cancelled", "seller-1");
    },
    "Invalid status transition"
  );

  // Test 3e: Cannot cancel from cancelled
  resetState();
  const order5 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });
  updateOrderStatus(order5.id, "cancelled", "buyer-1");
  
  assertThrows(
    () => {
      updateOrderStatus(order5.id, "confirmed", "seller-1");
    },
    "Invalid status transition"
  );

  console.log("✓ Cancel rules test passed");
}

// Test 4: statusHistory append behavior
function testStatusHistoryAppend() {
  resetState();
  console.log("Test 4: statusHistory append behavior");

  const request = createMockRequest("req-1", "buyer-1");
  const quote = createMockQuote("seller-1");

  // Create order
  const order = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });

  // Initial statusHistory should have one entry (awarded)
  assertEqual(order.statusHistory.length, 1, "Initial statusHistory should have 1 entry");
  assertEqual(order.statusHistory[0].status, "awarded", "First entry should be 'awarded'");
  assertEqual(order.statusHistory[0].byUserId, "buyer-1", "First entry should be by buyer");

  // Update to confirmed
  dateCallCount = 0; // Reset to get predictable timestamps
  const confirmedOrder = updateOrderStatus(order.id, "confirmed", "seller-1", "Seller confirmed");
  assert(confirmedOrder !== null, "Should update to confirmed");
  assertEqual(confirmedOrder!.statusHistory.length, 2, "statusHistory should have 2 entries");
  assertEqual(confirmedOrder!.statusHistory[0].status, "awarded", "First entry should still be 'awarded'");
  assertEqual(confirmedOrder!.statusHistory[1].status, "confirmed", "Second entry should be 'confirmed'");
  assertEqual(confirmedOrder!.statusHistory[1].byUserId, "seller-1", "Second entry should be by seller");
  assertEqual(confirmedOrder!.statusHistory[1].note, "Seller confirmed", "Second entry should have note");

  // Update to scheduled
  dateCallCount = 0;
  const scheduledOrder = updateOrderStatus(order.id, "scheduled", "seller-1", "Scheduled for delivery");
  assert(scheduledOrder !== null, "Should update to scheduled");
  assertEqual(scheduledOrder!.statusHistory.length, 3, "statusHistory should have 3 entries");
  assertEqual(scheduledOrder!.statusHistory[2].status, "scheduled", "Third entry should be 'scheduled'");
  assertEqual(scheduledOrder!.statusHistory[2].note, "Scheduled for delivery", "Third entry should have note");

  // Verify all previous entries are preserved
  assertEqual(scheduledOrder!.statusHistory[0].status, "awarded", "First entry preserved");
  assertEqual(scheduledOrder!.statusHistory[1].status, "confirmed", "Second entry preserved");

  console.log("✓ statusHistory append behavior test passed");
}

// Test 5: Re-award after cancellation (idempotency edge case)
function testReAwardAfterCancellation() {
  resetState();
  console.log("Test 5: Re-award after cancellation");

  const request = createMockRequest("req-1", "buyer-1");
  const quote = createMockQuote("seller-1");

  // Create and cancel order
  const order1 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });
  updateOrderStatus(order1.id, "cancelled", "buyer-1");

  // Should be able to create a new order after cancellation
  const order2 = createOrderFromAward({
    request,
    quote,
    buyerId: "buyer-1",
  });

  assert(order2 !== null, "Should create new order after cancellation");
  assert(order2.id !== order1.id, "New order should have different ID");
  assertEqual(order2.status, "awarded", "New order should start with 'awarded' status");

  console.log("✓ Re-award after cancellation test passed");
}

// Run all tests
function runTests() {
  console.log("Running Order lifecycle tests...\n");

  try {
    testCreateOrderIdempotency();
    testStatusTransitions();
    testCancelRules();
    testStatusHistoryAppend();
    testReAwardAfterCancellation();

    console.log("\n✅ All tests passed!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runTests();

