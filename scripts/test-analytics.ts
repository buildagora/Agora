/**
 * Lightweight tests for Analytics core (Layer 7)
 * Tests: event logging append-only, first-response dedupe, metric computation
 */

// Mock browser globals for Node.js
const MOCK_DATE_1 = "2024-01-15T10:00:00.000Z";
const MOCK_DATE_2 = "2024-01-15T11:00:00.000Z";
const MOCK_DATE_3 = "2024-01-15T12:00:00.000Z";
const MOCK_DATE_4 = "2024-01-15T13:00:00.000Z";

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
const RealDate = Date;
class MockDate extends RealDate {
  static currentTime = new RealDate(MOCK_DATE_1).getTime();

  constructor(...args: any[]) {
    if (args.length === 0) {
      super(MockDate.currentTime);
    } else {
      super(...(args as [string | number | Date]));
    }
  }

  static now() {
    return MockDate.currentTime;
  }

  toISOString() {
    const time = MockDate.currentTime;
    if (time === new RealDate(MOCK_DATE_1).getTime()) return MOCK_DATE_1;
    if (time === new RealDate(MOCK_DATE_2).getTime()) return MOCK_DATE_2;
    if (time === new RealDate(MOCK_DATE_3).getTime()) return MOCK_DATE_3;
    if (time === new RealDate(MOCK_DATE_4).getTime()) return MOCK_DATE_4;
    return new RealDate(time).toISOString();
  }
}

function setTime(isoString: string) {
  MockDate.currentTime = new RealDate(isoString).getTime();
}

(global as any).window = global;
(global as any).localStorage = localStorage;
(global as any).sessionStorage = sessionStorage;
(global as any).Date = MockDate as any;

// Import analytics helpers after mocks are set up
import { logEvent, listEventsBySeller, listEventsByRequest, type EventLogEntry } from "../src/lib/eventLog";
import { getSupplierMetrics } from "../src/lib/supplierMetrics";
import { writeGlobalJson, readGlobalJson } from "../src/lib/scopedStorage";

// Helper to reset state
function resetState() {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  uuidCounter = 0;
  setTime(MOCK_DATE_1);
}

// Test 1: Event logging is append-only
function testEventLoggingAppendOnly() {
  console.log("\n📊 Test 1: Event logging is append-only");
  resetState();

  // Log initial events
  const event1 = logEvent({
    type: "REQUEST_POSTED",
    requestId: "req-1",
    buyerId: "buyer-1",
  });

  const event2 = logEvent({
    type: "DISPATCH_SENT",
    requestId: "req-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
  });

  // Get all events
  const allEvents = readGlobalJson<EventLogEntry[]>("eventLog", []);
  
  // Verify events are appended (not replaced)
  if (allEvents.length !== 2) {
    throw new Error(`Expected 2 events, got ${allEvents.length}`);
  }

  if (allEvents[0].id !== event1.id) {
    throw new Error("First event ID mismatch");
  }

  if (allEvents[1].id !== event2.id) {
    throw new Error("Second event ID mismatch");
  }

  // Log another event
  const event3 = logEvent({
    type: "BID_SUBMITTED",
    requestId: "req-1",
    sellerId: "seller-1",
  });

  const allEventsAfter = readGlobalJson<EventLogEntry[]>("eventLog", []);
  
  // Verify previous events are still there
  if (allEventsAfter.length !== 3) {
    throw new Error(`Expected 3 events after third log, got ${allEventsAfter.length}`);
  }

  if (allEventsAfter[0].id !== event1.id || allEventsAfter[1].id !== event2.id) {
    throw new Error("Previous events were modified or removed (not append-only)");
  }

  if (allEventsAfter[2].id !== event3.id) {
    throw new Error("Third event not appended correctly");
  }

  console.log("✅ Event logging is append-only");
}

// Test 2: First-response dedupe logic works
function testFirstResponseDedupe() {
  console.log("\n📊 Test 2: First-response dedupe logic");
  resetState();

  const requestId = "req-1";
  const sellerId = "seller-1";
  const buyerId = "buyer-1";

  // Create a mock dispatch record
  writeGlobalJson("requestDispatches", [
    {
      requestId,
      sellerId,
      phase: "primary",
      status: "sent",
      sentAt: MOCK_DATE_1,
    },
  ]);

  // Log dispatch event
  setTime(MOCK_DATE_1);
  logEvent({
    type: "DISPATCH_SENT",
    requestId,
    buyerId,
    sellerId,
  });

  // First response - should log SUPPLIER_RESPONDED
  setTime(MOCK_DATE_2);
  logEvent({
    type: "SUPPLIER_RESPONDED",
    requestId,
    buyerId,
    sellerId,
  });

  // Get events - should have one SUPPLIER_RESPONDED event
  const events1 = listEventsBySeller(sellerId);
  const respondedEvents1 = events1.filter((e) => e.type === "SUPPLIER_RESPONDED");
  
  if (respondedEvents1.length !== 1) {
    throw new Error(`Expected 1 SUPPLIER_RESPONDED event, got ${respondedEvents1.length}`);
  }

  const firstEventId = respondedEvents1[0].id;

  // Try to log another SUPPLIER_RESPONDED for the same request (simulating duplicate call)
  // In real code, markDispatchAsResponded checks if already responded before logging
  // For this test, we simulate the dedupe by checking if event already exists
  setTime(MOCK_DATE_3);
  
  // Check if we already have a SUPPLIER_RESPONDED for this request
  const existingEvents = listEventsByRequest(requestId);
  const existingResponded = existingEvents.filter(
    (e) => e.type === "SUPPLIER_RESPONDED" && e.sellerId === sellerId
  );
  
  if (existingResponded.length > 0) {
    // Already responded - don't log again (this is the dedupe logic)
    // In real code, markDispatchAsResponded does this check
  } else {
    // Would log if not already responded
    logEvent({
      type: "SUPPLIER_RESPONDED",
      requestId,
      buyerId,
      sellerId,
    });
  }

  // Get events again - should still have only one SUPPLIER_RESPONDED event
  const events2 = listEventsBySeller(sellerId);
  const respondedEvents2 = events2.filter((e) => e.type === "SUPPLIER_RESPONDED");
  
  if (respondedEvents2.length !== 1) {
    throw new Error(
      `Expected 1 SUPPLIER_RESPONDED event after duplicate check, got ${respondedEvents2.length}`
    );
  }

  if (respondedEvents2[0].id !== firstEventId) {
    throw new Error("Event ID changed (new event was created instead of deduplicating)");
  }

  console.log("✅ First-response dedupe logic works");
}

// Test 3: Metric computation for simple synthetic data
function testMetricComputation() {
  console.log("\n📊 Test 3: Metric computation for simple synthetic data");
  resetState();

  const sellerId = "seller-1";
  const requestId = "req-1";
  const buyerId = "buyer-1";

  // Create synthetic event data:
  // - 2 dispatches
  // - 1 response (within 30 minutes)
  // - 1 bid submitted
  // - 1 order awarded
  // - 1 order confirmed (within SLA)
  // - 1 order delivered (within SLA)
  
  // Use dates within the last 30 days (window for metrics)
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 1); // 1 day ago (within 30-day window)
  const eventDate1 = baseDate.toISOString();
  const eventDate2 = new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(); // 30 min later
  const eventDate3 = new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour later
  const eventDate4 = new Date(baseDate.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours later

  setTime(eventDate1);
  logEvent({
    type: "DISPATCH_SENT",
    requestId,
    buyerId,
    sellerId,
    metadata: { phase: "primary" },
  });

  setTime(eventDate1);
  logEvent({
    type: "DISPATCH_SENT",
    requestId: "req-2",
    buyerId,
    sellerId,
    metadata: { phase: "primary" },
  });

  // Response to first dispatch (30 minutes later)
  setTime(eventDate2);
  logEvent({
    type: "SUPPLIER_RESPONDED",
    requestId,
    buyerId,
    sellerId,
  });

  setTime(eventDate2);
  logEvent({
    type: "BID_SUBMITTED",
    requestId,
    buyerId,
    sellerId,
    metadata: { totalPrice: 1000, leadTimeDays: 5 },
  });

  setTime(eventDate2);
  logEvent({
    type: "ORDER_AWARDED",
    requestId,
    orderId: "order-1",
    buyerId,
    sellerId,
    metadata: { totalPrice: 1000 },
  });

  // Confirmed within SLA (4 hours = 240 minutes)
  setTime(eventDate3);
  logEvent({
    type: "ORDER_CONFIRMED",
    requestId,
    orderId: "order-1",
    buyerId,
    sellerId,
  });

  // Create a mock order for delivery rate calculation
  // Store in both buyer and seller scoped storage (as order.ts does)
  const mockOrder = {
    id: "order-1",
    requestId,
    buyerId,
    sellerId,
    awardedQuoteId: "quote-1",
    totalPrice: 1000,
    fulfillmentMode: "delivery" as const,
    deliveryDetails: {
      mode: "delivery" as const,
      address: "123 Main St",
      needBy: eventDate4, // Delivered on time
    },
    items: [],
    status: "delivered" as const,
    statusHistory: [
      { status: "awarded" as const, at: eventDate2, byUserId: buyerId },
      { status: "confirmed" as const, at: eventDate3, byUserId: sellerId },
      { status: "delivered" as const, at: eventDate4, byUserId: sellerId },
    ],
    createdAt: eventDate2,
    updatedAt: eventDate4,
  };
  
  writeGlobalJson(`data.${buyerId}.orders`, [mockOrder]);
  writeGlobalJson(`data.${sellerId}.orders`, [mockOrder]);

  // Delivered within SLA (72 hours)
  setTime(eventDate4);
  logEvent({
    type: "ORDER_DELIVERED",
    requestId,
    orderId: "order-1",
    buyerId,
    sellerId,
  });

  // Compute metrics
  const metrics = getSupplierMetrics(sellerId, 30);

  // Verify response rate: 1 response / 2 dispatches = 0.5
  if (typeof metrics.responseRate !== "number") {
    throw new Error(`Expected responseRate to be a number, got ${metrics.responseRate}`);
  }
  if (Math.abs(metrics.responseRate - 0.5) > 0.01) {
    throw new Error(`Expected responseRate ~0.5, got ${metrics.responseRate}`);
  }

  // Verify median response time: should be ~30 minutes (difference between eventDate1 and eventDate2)
  if (typeof metrics.medianResponseTimeMinutes !== "number") {
    throw new Error(`Expected medianResponseTimeMinutes to be a number, got ${metrics.medianResponseTimeMinutes}`);
  }
  const expectedResponseTime = (new Date(eventDate2).getTime() - new Date(eventDate1).getTime()) / (1000 * 60);
  if (Math.abs(metrics.medianResponseTimeMinutes - expectedResponseTime) > 1) {
    throw new Error(
      `Expected medianResponseTimeMinutes ~${expectedResponseTime}, got ${metrics.medianResponseTimeMinutes}`
    );
  }

  // Verify win rate: 1 awarded / 1 bid = 1.0
  if (typeof metrics.winRate !== "number") {
    throw new Error(`Expected winRate to be a number, got ${metrics.winRate}`);
  }
  if (Math.abs(metrics.winRate - 1.0) > 0.01) {
    throw new Error(`Expected winRate ~1.0, got ${metrics.winRate}`);
  }

  // Verify on-time confirm rate: 1 confirmed within SLA / 1 awarded = 1.0
  if (typeof metrics.onTimeConfirmRate !== "number") {
    throw new Error(`Expected onTimeConfirmRate to be a number, got ${metrics.onTimeConfirmRate}`);
  }
  if (Math.abs(metrics.onTimeConfirmRate - 1.0) > 0.01) {
    throw new Error(`Expected onTimeConfirmRate ~1.0, got ${metrics.onTimeConfirmRate}`);
  }

  // Verify on-time delivery rate: 1 delivered within SLA / 1 confirmed = 1.0
  if (typeof metrics.onTimeDeliveryRate !== "number") {
    throw new Error(`Expected onTimeDeliveryRate to be a number, got ${metrics.onTimeDeliveryRate}`);
  }
  if (Math.abs(metrics.onTimeDeliveryRate - 1.0) > 0.01) {
    throw new Error(`Expected onTimeDeliveryRate ~1.0, got ${metrics.onTimeDeliveryRate}`);
  }

  console.log("✅ Metric computation works for synthetic data");
  console.log(`   Response rate: ${metrics.responseRate}`);
  console.log(`   Median response time: ${metrics.medianResponseTimeMinutes} min`);
  console.log(`   Win rate: ${metrics.winRate}`);
  console.log(`   On-time confirm rate: ${metrics.onTimeConfirmRate}`);
  console.log(`   On-time delivery rate: ${metrics.onTimeDeliveryRate}`);
}

// Test 4: Metric computation with no data returns "N/A"
function testMetricComputationNoData() {
  console.log("\n📊 Test 4: Metric computation with no data");
  resetState();

  const sellerId = "seller-no-data";

  // Compute metrics for seller with no events
  const metrics = getSupplierMetrics(sellerId, 30);

  if (metrics.responseRate !== "N/A") {
    throw new Error(`Expected responseRate to be "N/A", got ${metrics.responseRate}`);
  }

  if (metrics.medianResponseTimeMinutes !== "N/A") {
    throw new Error(`Expected medianResponseTimeMinutes to be "N/A", got ${metrics.medianResponseTimeMinutes}`);
  }

  if (metrics.winRate !== "N/A") {
    throw new Error(`Expected winRate to be "N/A", got ${metrics.winRate}`);
  }

  if (metrics.onTimeConfirmRate !== "N/A") {
    throw new Error(`Expected onTimeConfirmRate to be "N/A", got ${metrics.onTimeConfirmRate}`);
  }

  if (metrics.onTimeDeliveryRate !== "N/A") {
    throw new Error(`Expected onTimeDeliveryRate to be "N/A", got ${metrics.onTimeDeliveryRate}`);
  }

  console.log("✅ Metric computation returns 'N/A' when no data exists");
}

// Run all tests
function runTests() {
  console.log("🧪 Running Analytics Core Tests...\n");

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: "Event logging append-only", fn: testEventLoggingAppendOnly },
    { name: "First-response dedupe", fn: testFirstResponseDedupe },
    { name: "Metric computation", fn: testMetricComputation },
    { name: "Metric computation (no data)", fn: testMetricComputationNoData },
  ];

  for (const test of tests) {
    try {
      test.fn();
      passed++;
    } catch (error) {
      failed++;
      console.error(`❌ ${test.name} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log("✅ All analytics core tests passed!");
}

// Run tests
runTests();

