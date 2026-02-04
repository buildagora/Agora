/**
 * Lightweight tests for Exception Detection and Auto-Escalation
 * Tests: NO_SUPPLIER_RESPONSE, SCHEDULE_OVERDUE, fallback auto-dispatch idempotency
 */

// Mock browser globals for Node.js
const BASE_TIME = "2024-01-15T10:00:00.000Z";
const AFTER_SLA_NO_RESPONSE = "2024-01-15T10:31:00.000Z"; // 31 minutes later (past 30 min SLA)
const AFTER_SLA_SCHEDULE = "2024-01-16T11:00:00.000Z"; // 25 hours later (past 24 hour SLA)
const BEFORE_SLA = "2024-01-15T10:15:00.000Z"; // 15 minutes later (before SLA)

let uuidCounter = 0;
let currentTime = BASE_TIME;

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

// Mock Date with controllable time - use native Date but override static methods
const RealDate = Date;
class MockDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(currentTime);
    } else {
      super(...(args as [string | number | Date]));
    }
  }

  static now() {
    return RealDate.now();
  }
}

(global as any).window = global;
(global as any).localStorage = localStorage;
(global as any).sessionStorage = sessionStorage;
(global as any).Date = MockDate as any;

// Set time helper
function setTime(time: string) {
  currentTime = time;
  // Override Date.now to return the current time
  (Date as any).now = () => new RealDate(currentTime).getTime();
}

// Import after mocks
import { detectAllExceptions, detectExceptionsForOrder } from "../src/lib/exceptionDetection";
import { checkAndExpandFallback } from "../src/lib/requestDispatch";
import { type RFQRequest, type RequestItem, type DeliveryTerms } from "../src/lib/request";
import { type DispatchRecord } from "../src/lib/requestDispatch";
import { type Order, type OrderStatusEvent } from "../src/lib/order";
import { SLA_NO_RESPONSE_MINUTES } from "../src/lib/slaConfig";

// Helper to create a mock request
function createMockRequest(id: string, buyerId: string, status: "draft" | "posted" = "posted"): RFQRequest {
  return {
    id,
    buyerId,
    status,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    delivery: {
      mode: "delivery",
      needBy: "2024-01-20T10:00:00.000Z",
      address: "123 Main St, City, ST 12345",
    } as DeliveryTerms,
    items: [
      {
        id: "item-1",
        description: "Test item",
        category: "Roofing",
        quantity: 10,
        unit: "ea",
      },
    ] as RequestItem[],
  };
}

// Helper to create mock dispatch records
function createMockDispatchRecords(
  requestId: string,
  sellerIds: string[],
  phase: "primary" | "fallback" = "primary",
  responded: boolean = false
): DispatchRecord[] {
  return sellerIds.map((sellerId) => ({
    requestId,
    sellerId,
    phase,
    status: responded ? "responded" : "sent",
    sentAt: BASE_TIME,
    respondedAt: responded ? AFTER_SLA_NO_RESPONSE : undefined,
  }));
}

// Helper to create mock order
function createMockOrder(
  id: string,
  requestId: string,
  buyerId: string,
  sellerId: string,
  status: "awarded" | "confirmed" | "scheduled" | "delivered" = "awarded",
  confirmedAt?: string,
  scheduledAt?: string
): Order {
  const statusHistory: OrderStatusEvent[] = [
    {
      status: "awarded",
      at: BASE_TIME,
      byUserId: buyerId,
    },
  ];

  if (status === "confirmed" || status === "scheduled" || status === "delivered") {
    statusHistory.push({
      status: "confirmed",
      at: confirmedAt || AFTER_SLA_NO_RESPONSE,
      byUserId: sellerId,
    });
  }

  if (status === "scheduled" || status === "delivered") {
    statusHistory.push({
      status: "scheduled",
      at: scheduledAt || AFTER_SLA_NO_RESPONSE,
      byUserId: sellerId,
    });
  }

  if (status === "delivered") {
    statusHistory.push({
      status: "delivered",
      at: AFTER_SLA_SCHEDULE,
      byUserId: sellerId,
    });
  }

  return {
    id,
    requestId,
    buyerId,
    sellerId,
    awardedQuoteId: "quote-1",
    totalPrice: 1000,
    fulfillmentMode: "delivery",
    deliveryDetails: {
      mode: "delivery",
      needBy: "2024-01-20T10:00:00.000Z",
      address: "123 Main St",
    },
    items: [],
    status,
    statusHistory,
    createdAt: BASE_TIME,
    updatedAt: currentTime,
  };
}

// Assertion helpers
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

// Reset state between tests
function resetState() {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  uuidCounter = 0;
  currentTime = BASE_TIME;
}

// Test 1: NO_SUPPLIER_RESPONSE exception triggers when no response after SLA
function testNoSupplierResponseException() {
  resetState();
  console.log("Test 1: NO_SUPPLIER_RESPONSE exception triggers");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  const dispatchRecords = createMockDispatchRecords("req-1", ["seller-1", "seller-2"], "primary", false);
  
  // Set time to after SLA (31 minutes = 1860 seconds = past 30 minute SLA)
  setTime(AFTER_SLA_NO_RESPONSE);

  // Store dispatch records in mock storage so getDispatchRecords can find them
  const dispatchRecordsKey = "agora.requestDispatches";
  mockStorage[dispatchRecordsKey] = JSON.stringify({
    "req-1": dispatchRecords,
  });

  const exceptions = detectAllExceptions({
    request,
    dispatchRecords,
    order: null,
    now: AFTER_SLA_NO_RESPONSE,
  });

  // Debug: log all exceptions
  if (process.env.DEBUG) {
    console.log("All exceptions:", exceptions);
    console.log("Dispatch records:", dispatchRecords);
    const elapsed = (new Date(AFTER_SLA_NO_RESPONSE).getTime() - new Date(BASE_TIME).getTime()) / (1000 * 60);
    console.log("Time difference:", elapsed, "minutes");
    console.log("SLA threshold:", SLA_NO_RESPONSE_MINUTES, "minutes");
  }

  // Should have NO_SUPPLIER_RESPONSE exception
  const noResponseException = exceptions.find((e) => e.type === "NO_SUPPLIER_RESPONSE");
  assert(!!noResponseException, `Should detect NO_SUPPLIER_RESPONSE exception. Found exceptions: ${exceptions.map(e => e.type).join(", ")}`);
  assert(!noResponseException!.isResolved, "Exception should not be resolved");
  assert(noResponseException!.severity === "info" || noResponseException!.severity === "warning" || noResponseException!.severity === "critical", "Should have severity");
  
  console.log("✅ NO_SUPPLIER_RESPONSE exception detected correctly");
}

// Test 2: NO_SUPPLIER_RESPONSE does NOT trigger before SLA
function testNoSupplierResponseBeforeSLA() {
  resetState();
  console.log("Test 2: NO_SUPPLIER_RESPONSE does NOT trigger before SLA");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  const dispatchRecords = createMockDispatchRecords("req-1", ["seller-1"], "primary", false);
  
  // Set time to before SLA
  setTime(BEFORE_SLA);

  const exceptions = detectAllExceptions({
    request,
    dispatchRecords,
    order: null,
    now: BEFORE_SLA,
  });

  // Should NOT have NO_SUPPLIER_RESPONSE exception
  const noResponseException = exceptions.find((e) => e.type === "NO_SUPPLIER_RESPONSE");
  assert(!noResponseException, "Should NOT detect NO_SUPPLIER_RESPONSE exception before SLA");
  
  console.log("✅ NO_SUPPLIER_RESPONSE correctly not triggered before SLA");
}

// Test 3: NO_SUPPLIER_RESPONSE is resolved when supplier responds
function testNoSupplierResponseResolved() {
  resetState();
  console.log("Test 3: NO_SUPPLIER_RESPONSE is resolved when supplier responds");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  const dispatchRecords = createMockDispatchRecords("req-1", ["seller-1"], "primary", true); // responded = true
  
  setTime(AFTER_SLA_NO_RESPONSE);

  const exceptions = detectAllExceptions({
    request,
    dispatchRecords,
    order: null,
    now: AFTER_SLA_NO_RESPONSE,
  });

  // Should have NO_SUPPLIER_RESPONSE exception, but it should be resolved
  const noResponseException = exceptions.find((e) => e.type === "NO_SUPPLIER_RESPONSE");
  if (noResponseException) {
    assert(noResponseException.isResolved, "Exception should be resolved when supplier responds");
  }
  
  console.log("✅ NO_SUPPLIER_RESPONSE correctly resolved when supplier responds");
}

// Test 4: SCHEDULE_OVERDUE exception triggers when confirmed but not scheduled after SLA
function testScheduleOverdueException() {
  resetState();
  console.log("Test 4: SCHEDULE_OVERDUE exception triggers");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  // Order was confirmed at AFTER_SLA_NO_RESPONSE, now we're at AFTER_SLA_SCHEDULE (25 hours later)
  const order = createMockOrder("order-1", "req-1", "buyer-1", "seller-1", "confirmed", AFTER_SLA_NO_RESPONSE);
  
  // Set time to after schedule SLA (25 hours after confirmed, which is past 24 hour SLA)
  setTime(AFTER_SLA_SCHEDULE);

  const exceptions = detectExceptionsForOrder({
    order,
    request,
    now: AFTER_SLA_SCHEDULE,
  });

  // Debug: log all exceptions
  if (process.env.DEBUG) {
    console.log("All exceptions:", exceptions);
    console.log("Order status:", order.status);
    console.log("Order statusHistory:", order.statusHistory);
    console.log("Time difference:", (new Date(AFTER_SLA_SCHEDULE).getTime() - new Date(AFTER_SLA_NO_RESPONSE).getTime()) / (1000 * 60 * 60), "hours");
  }

  // Should have SCHEDULE_OVERDUE exception
  const scheduleException = exceptions.find((e) => e.type === "SCHEDULE_OVERDUE");
  assert(!!scheduleException, `Should detect SCHEDULE_OVERDUE exception. Found exceptions: ${exceptions.map(e => e.type).join(", ")}`);
  assert(!scheduleException!.isResolved, "Exception should not be resolved");
  assert(scheduleException!.relatedIds.orderId === "order-1", "Should reference correct order");
  
  console.log("✅ SCHEDULE_OVERDUE exception detected correctly");
}

// Test 5: SCHEDULE_OVERDUE is resolved when order is scheduled
function testScheduleOverdueResolved() {
  resetState();
  console.log("Test 5: SCHEDULE_OVERDUE is resolved when order is scheduled");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  const order = createMockOrder("order-1", "req-1", "buyer-1", "seller-1", "scheduled", AFTER_SLA_NO_RESPONSE, AFTER_SLA_SCHEDULE);
  
  setTime(AFTER_SLA_SCHEDULE);

  const exceptions = detectExceptionsForOrder({
    order,
    request,
    now: AFTER_SLA_SCHEDULE,
  });

  // Should have SCHEDULE_OVERDUE exception, but it should be resolved
  const scheduleException = exceptions.find((e) => e.type === "SCHEDULE_OVERDUE");
  if (scheduleException) {
    assert(scheduleException.isResolved, "Exception should be resolved when order is scheduled");
  }
  
  console.log("✅ SCHEDULE_OVERDUE correctly resolved when order is scheduled");
}

// Test 6: Fallback auto-dispatch triggers once (idempotency)
// Note: This test requires mocking supplier coverage and routing, which is complex.
// Instead, we test the idempotency logic by checking the isFallbackDispatched guard.
function testFallbackAutoDispatchIdempotency() {
  resetState();
  console.log("Test 6: Fallback auto-dispatch idempotency (idempotency guard check)");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  
  // Mock dispatch records storage with primary records
  const dispatchRecordsKey = "agora.requestDispatches";
  const initialRecords: DispatchRecord[] = createMockDispatchRecords("req-1", ["seller-1"], "primary", false);
  mockStorage[dispatchRecordsKey] = JSON.stringify({
    "req-1": initialRecords,
  });

  // Mock supplier coverage and routing data
  // We need to set up minimal data so routing doesn't fail
  const supplierCoverageKey = "agora.supplierCoverage";
  mockStorage[supplierCoverageKey] = JSON.stringify({
    "seller-2": {
      sellerId: "seller-2",
      categories: ["Roofing"],
      serviceZipPrefixes: ["123"],
      active: true,
    },
    "seller-3": {
      sellerId: "seller-3",
      categories: ["Roofing"],
      serviceZipPrefixes: ["123"],
      active: true,
    },
  });

  // Mock users registry
  const usersKey = "agora.users";
  mockStorage[usersKey] = JSON.stringify([
    { id: "buyer-1", email: "buyer@test.com", role: "BUYER" },
    { id: "seller-1", email: "seller1@test.com", role: "SELLER" },
    { id: "seller-2", email: "seller2@test.com", role: "SELLER" },
    { id: "seller-3", email: "seller3@test.com", role: "SELLER" },
  ]);

  setTime(AFTER_SLA_NO_RESPONSE);

  // First call - should expand (if routing returns fallback suppliers)
  const result1 = checkAndExpandFallback(request);
  
  // If routing returns no fallback suppliers, result1 will be null
  // That's okay - we're testing the idempotency guard, not the routing itself
  if (result1 && result1.fallbackCount > 0) {
    // Second call - should be idempotent (return same result, not duplicate)
    const result2 = checkAndExpandFallback(request);
    assert(!!result2, "Second call should return result");
    assertEqual(result2!.fallbackCount, result1.fallbackCount, "Fallback count should be same (idempotent)");

    // Check that dispatch records weren't duplicated
    const storedRecords = JSON.parse(mockStorage[dispatchRecordsKey] || "{}");
    const reqRecords = storedRecords["req-1"] || [];
    const fallbackRecords = reqRecords.filter((r: DispatchRecord) => r.phase === "fallback");
    assertEqual(fallbackRecords.length, result1.fallbackCount, "Should not duplicate fallback records");
    
    console.log("✅ Fallback auto-dispatch is idempotent");
  } else {
    // Test the idempotency guard directly by simulating already-dispatched fallback
    const recordsWithFallback: DispatchRecord[] = [
      ...initialRecords,
      {
        requestId: "req-1",
        sellerId: "seller-2",
        phase: "fallback",
        status: "sent",
        sentAt: AFTER_SLA_NO_RESPONSE,
      },
    ];
    mockStorage[dispatchRecordsKey] = JSON.stringify({
      "req-1": recordsWithFallback,
    });

    // Now checkAndExpandFallback should return idempotent result (not null, same count)
    const resultAfterFallback = checkAndExpandFallback(request);
    assert(!!resultAfterFallback, "Should return result when fallback already dispatched");
    assertEqual(resultAfterFallback!.fallbackCount, 1, "Should return existing fallback count");
    
    console.log("✅ Fallback idempotency guard works correctly");
  }
}

// Test 7: Fallback does NOT trigger if supplier already responded
function testFallbackDoesNotTriggerIfResponded() {
  resetState();
  console.log("Test 7: Fallback does NOT trigger if supplier already responded");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  
  // Create dispatch records with one responded
  const dispatchRecords: DispatchRecord[] = [
    {
      requestId: "req-1",
      sellerId: "seller-1",
      phase: "primary",
      status: "responded",
      sentAt: BASE_TIME,
      respondedAt: AFTER_SLA_NO_RESPONSE,
    },
  ];
  
  const dispatchRecordsKey = "agora.requestDispatches";
  mockStorage[dispatchRecordsKey] = JSON.stringify({
    "req-1": dispatchRecords,
  });

  // Mock users registry
  const usersKey = "agora.users";
  mockStorage[usersKey] = JSON.stringify([
    { id: "buyer-1", email: "buyer@test.com", role: "BUYER" },
    { id: "seller-1", email: "seller1@test.com", role: "SELLER" },
  ]);

  setTime(AFTER_SLA_NO_RESPONSE);

  // Should NOT expand because supplier already responded
  const result = checkAndExpandFallback(request);
  assert(!result, "Should NOT expand fallback if supplier already responded");
  
  console.log("✅ Fallback correctly does NOT trigger when supplier responded");
}

// Test 8: Fallback does NOT trigger before SLA timeout
function testFallbackDoesNotTriggerBeforeSLA() {
  resetState();
  console.log("Test 8: Fallback does NOT trigger before SLA timeout");

  const request = createMockRequest("req-1", "buyer-1", "posted");
  
  const dispatchRecords: DispatchRecord[] = createMockDispatchRecords("req-1", ["seller-1"], "primary", false);
  const dispatchRecordsKey = "agora.requestDispatches";
  mockStorage[dispatchRecordsKey] = JSON.stringify({
    "req-1": dispatchRecords,
  });

  // Mock users registry
  const usersKey = "agora.users";
  mockStorage[usersKey] = JSON.stringify([
    { id: "buyer-1", email: "buyer@test.com", role: "BUYER" },
    { id: "seller-1", email: "seller1@test.com", role: "SELLER" },
  ]);

  // Set time to before SLA
  setTime(BEFORE_SLA);

  // Should NOT expand because not enough time has passed
  const result = checkAndExpandFallback(request);
  assert(!result, "Should NOT expand fallback before SLA timeout");
  
  console.log("✅ Fallback correctly does NOT trigger before SLA timeout");
}

// Run all tests
function runTests() {
  console.log("🧪 Running Exception Detection and Auto-Escalation Tests\n");

  const tests = [
    testNoSupplierResponseException,
    testNoSupplierResponseBeforeSLA,
    testNoSupplierResponseResolved,
    testScheduleOverdueException,
    testScheduleOverdueResolved,
    testFallbackAutoDispatchIdempotency,
    testFallbackDoesNotTriggerIfResponded,
    testFallbackDoesNotTriggerBeforeSLA,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      failed++;
      console.error(`❌ ${test.name} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests();

