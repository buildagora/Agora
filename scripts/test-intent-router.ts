/**
 * Test script for Agent Intent Router
 * Run with: npm run test:intent-router
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
    return `test-uuid-${Math.random().toString(36).substring(2, 15)}`;
  },
};

// Now import modules
import { routeIntent } from "../src/lib/agent/intentRouter";
import type { RouterDecision } from "../src/lib/agent/intentRouter";

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

console.log("🧪 Testing Agent Intent Router...\n");

// Test 1: "I need 10 bundles of shingles" => RFQ_CREATE, categoryId roofing, lineItems qty 10
test("Extracts RFQ from 'I need 10 bundles of shingles'", () => {
  const result = routeIntent({
    threadId: "test-thread-1",
    userMessage: "I need 10 bundles of shingles",
  });
  
  if (result.mode !== "RFQ_CREATE") {
    console.error(`Expected mode RFQ_CREATE, got ${result.mode}`);
    return false;
  }
  
  if (result.updatedDraft?.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${result.updatedDraft?.categoryId}'`);
    return false;
  }
  
  if (!result.updatedDraft?.lineItems || result.updatedDraft.lineItems.length === 0) {
    console.error("Expected lineItems to be extracted");
    return false;
  }
  
  const firstItem = result.updatedDraft.lineItems[0];
  if (firstItem.quantity !== 10) {
    console.error(`Expected quantity 10, got ${firstItem.quantity}`);
    return false;
  }
  
  if (!firstItem.description.toLowerCase().includes("shingle")) {
    console.error(`Expected description to include 'shingle', got '${firstItem.description}'`);
    return false;
  }
  
  if (!result.missingSlots.includes("fulfillmentType") && !result.missingSlots.includes("jobNameOrPo")) {
    console.error(`Expected missing slots to include fulfillmentType or jobNameOrPo, got ${result.missingSlots.join(", ")}`);
    return false;
  }
  
  if (!result.nextQuestion) {
    console.error("Expected nextQuestion to be set");
    return false;
  }
  
  return true;
});

// Test 2: "deliver to 123 Main St Huntsville AL" when draft has DELIVERY => extracts deliveryAddress
test("Extracts delivery address when DELIVERY context is active", () => {
  const result = routeIntent({
    threadId: "test-thread-2",
    userMessage: "deliver to 123 Main St Huntsville AL",
    currentDraft: {
      fulfillmentType: "DELIVERY",
      categoryId: "roofing",
      lineItems: [{ description: "Shingles", quantity: 10 }],
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    },
  });
  
  if (!result.updatedDraft?.deliveryAddress) {
    console.error("Expected deliveryAddress to be extracted");
    return false;
  }
  
  if (!result.updatedDraft.deliveryAddress.includes("123 Main St")) {
    console.error(`Expected address to include '123 Main St', got '${result.updatedDraft.deliveryAddress}'`);
    return false;
  }
  
  // Should NOT create a line item from the address
  if (result.updatedDraft.lineItems?.some((item) => item.description.includes("123 Main"))) {
    console.error("Address should not be extracted as a line item");
    return false;
  }
  
  return true;
});

// Test 3: "10" when currentDraft has last line item description and __lastAskedSlot indicates quantity
test("Updates quantity when message is just a number and __lastAskedSlot is lineItems", () => {
  const currentDraft: any = {
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [{ description: "Shingles", quantity: 1 }],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "lineItems",
  };
  
  const result = routeIntent({
    threadId: "test-thread-3",
    userMessage: "10",
    currentDraft,
  });
  
  if (!result.updatedDraft?.lineItems || result.updatedDraft.lineItems.length === 0) {
    console.error("Expected lineItems to be present");
    return false;
  }
  
  const lastItem = result.updatedDraft.lineItems[result.updatedDraft.lineItems.length - 1];
  if (lastItem.quantity !== 10) {
    console.error(`Expected quantity to be updated to 10, got ${lastItem.quantity}`);
    return false;
  }
  
  if (lastItem.description !== "Shingles") {
    console.error(`Expected description to remain 'Shingles', got '${lastItem.description}'`);
    return false;
  }
  
  return true;
});

// Test 4: "mechanical" => categoryId hvac
test("Extracts 'mechanical' as categoryId hvac", () => {
  const result = routeIntent({
    threadId: "test-thread-4",
    userMessage: "mechanical",
  });
  
  if (result.updatedDraft?.categoryId !== "hvac") {
    console.error(`Expected categoryId 'hvac', got '${result.updatedDraft?.categoryId}'`);
    return false;
  }
  
  return true;
});

// Test 5: Advice message => ADVICE mode
test("Routes advice message to ADVICE mode", () => {
  const result = routeIntent({
    threadId: "test-thread-5",
    userMessage: "What should I use for a roof?",
  });
  
  if (result.mode !== "ADVICE") {
    console.error(`Expected mode ADVICE, got ${result.mode}`);
    return false;
  }
  
  if (result.capabilityId !== "cap.advice_mode.v1") {
    console.error(`Expected capabilityId 'cap.advice_mode.v1', got '${result.capabilityId}'`);
    return false;
  }
  
  return true;
});

// Test 6: Ready to dispatch when all slots are filled
test("Sets readyToDispatch true when all required slots are filled", () => {
  const result = routeIntent({
    threadId: "test-thread-6",
    userMessage: "Job name is Test Job",
    currentDraft: {
      jobNameOrPo: "Test Job",
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      needBy: "ASAP", // Required field
      lineItems: [{ description: "Shingles", quantity: 10 }],
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    },
  });
  
  if (!result.readyToDispatch) {
    console.error("Expected readyToDispatch to be true when all slots are filled");
    return false;
  }
  
  if (result.capabilityId !== "cap.dispatch_rfq.v1") {
    console.error(`Expected capabilityId 'cap.dispatch_rfq.v1', got '${result.capabilityId}'`);
    return false;
  }
  
  return true;
});

// Test 7: DELIVERY requires address
test("DELIVERY without address is not ready to dispatch", () => {
  const result = routeIntent({
    threadId: "test-thread-7",
    userMessage: "I need delivery",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "DELIVERY",
      lineItems: [{ description: "Shingles", quantity: 10 }],
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    },
  });
  
  if (result.readyToDispatch) {
    console.error("Expected readyToDispatch to be false when DELIVERY address is missing");
    return false;
  }
  
  if (!result.missingSlots.includes("deliveryAddress")) {
    console.error("Expected deliveryAddress to be in missingSlots");
    return false;
  }
  
  return true;
});

// Test 8: Priority extraction
test("Extracts priority from message", () => {
  const result = routeIntent({
    threadId: "test-thread-8",
    userMessage: "I need this urgent",
  });
  
  if (result.updatedDraft?.priority !== "urgent") {
    console.error(`Expected priority 'urgent', got '${result.updatedDraft?.priority}'`);
    return false;
  }
  
  return true;
});

// Test 9: Idempotency key is stable
test("Idempotency key is stable for same inputs", () => {
  const result1 = routeIntent({
    threadId: "test-thread-9",
    userMessage: "I need shingles",
    currentDraft: { categoryId: "roofing" },
  });
  
  const result2 = routeIntent({
    threadId: "test-thread-9",
    userMessage: "I need shingles",
    currentDraft: { categoryId: "roofing" },
  });
  
  if (result1.idempotencyKey !== result2.idempotencyKey) {
    console.error("Expected idempotency keys to be the same for identical inputs");
    return false;
  }
  
  return true;
});

// Test 10: Generic phrase "I need materials" does NOT create line items
test("Generic phrase 'I need materials' does not create line items", () => {
  const result = routeIntent({
    threadId: "test-thread-10",
    userMessage: "I need materials",
  });
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected no line items for generic phrase, got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  if (result.readyToDispatch) {
    console.error("Expected readyToDispatch to be false for generic phrase");
    return false;
  }
  
  if (!result.nextQuestion) {
    console.error("Expected nextQuestion to be set for generic phrase");
    return false;
  }
  
  // Should ask for category first
  if (!result.nextQuestion.toLowerCase().includes("category")) {
    console.error(`Expected question to ask about category, got '${result.nextQuestion}'`);
    return false;
  }
  
  return true;
});

// Test 11: Cannot confirm when jobNameOrPo is missing
test("Cannot confirm when jobNameOrPo is missing", () => {
  const result = routeIntent({
    threadId: "test-thread-11",
    userMessage: "pickup",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "Shingles", quantity: 10 }],
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
      // Missing jobNameOrPo
    },
  });
  
  if (result.readyToDispatch) {
    console.error("Expected readyToDispatch to be false when jobNameOrPo is missing");
    return false;
  }
  
  if (!result.missingSlots.includes("jobNameOrPo")) {
    console.error("Expected jobNameOrPo to be in missingSlots");
    return false;
  }
  
  return true;
});

// Test 12: Cannot confirm when lineItems missing
test("Cannot confirm when lineItems missing", () => {
  const result = routeIntent({
    threadId: "test-thread-12",
    userMessage: "Job name is Test Job",
    currentDraft: {
      jobNameOrPo: "Test Job",
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
      // Missing lineItems
    },
  });
  
  if (result.readyToDispatch) {
    console.error("Expected readyToDispatch to be false when lineItems is missing");
    return false;
  }
  
  if (!result.missingSlots.includes("lineItems")) {
    console.error("Expected lineItems to be in missingSlots");
    return false;
  }
  
  return true;
});

// Test 13: jobNameOrPo follow-up when __lastAskedSlot is jobNameOrPo
test("jobNameOrPo follow-up when __lastAskedSlot is jobNameOrPo", () => {
  const currentDraft: any = {
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [{ description: "Shingles", quantity: 10 }],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "jobNameOrPo",
  };
  
  const result = routeIntent({
    threadId: "test-thread-13",
    userMessage: "Agent V1 Test",
    currentDraft,
  });
  
  if (!result.updatedDraft?.jobNameOrPo) {
    console.error(`Expected jobNameOrPo to be set to 'Agent V1 Test', got '${result.updatedDraft?.jobNameOrPo}'`);
    return false;
  }
  
  if (result.updatedDraft.jobNameOrPo !== "Agent V1 Test") {
    console.error(`Expected jobNameOrPo 'Agent V1 Test', got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  return true;
});

// Test 14: Yes/no response to jobNameOrPo question asks for actual job name
test("Yes/no response to jobNameOrPo question asks for actual job name", () => {
  const currentDraft: any = {
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [{ description: "Shingles", quantity: 10 }],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "jobNameOrPo",
  };
  
  const result = routeIntent({
    threadId: "test-thread-14",
    userMessage: "yes",
    currentDraft,
  });
  
  if (result.updatedDraft?.jobNameOrPo) {
    console.error(`Expected jobNameOrPo NOT to be set for yes/no response, got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  if (!result.nextQuestion || !result.nextQuestion.includes("What should I label it as")) {
    console.error(`Expected nextQuestion to ask for job name/PO, got '${result.nextQuestion}'`);
    return false;
  }
  
  return true;
});

// Test 15: Slot-answer precedence for categoryId
test("When lastAskedSlot=categoryId and message='Roofing', only categoryId is set", () => {
  const currentDraft: any = {
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "categoryId",
  };
  
  const result = routeIntent({
    threadId: "test-thread-15",
    userMessage: "Roofing",
    currentDraft,
  });
  
  if (result.updatedDraft?.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${result.updatedDraft?.categoryId}'`);
    return false;
  }
  
  if (result.updatedDraft?.jobNameOrPo) {
    console.error(`Expected jobNameOrPo NOT to be set, got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected NO line items, got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  if (!result.reasons.some((r) => r.includes("slot-answer:categoryId"))) {
    console.error(`Expected reason to include 'slot-answer:categoryId', got ${result.reasons.join(", ")}`);
    return false;
  }
  
  return true;
});

// Test 16: Slot-answer precedence for fulfillmentType
test("When lastAskedSlot=fulfillmentType and message='Pickup', only fulfillmentType is set", () => {
  const currentDraft: any = {
    categoryId: "roofing",
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "fulfillmentType",
  };
  
  const result = routeIntent({
    threadId: "test-thread-16",
    userMessage: "Pickup",
    currentDraft,
  });
  
  if (result.updatedDraft?.fulfillmentType !== "PICKUP") {
    console.error(`Expected fulfillmentType 'PICKUP', got '${result.updatedDraft?.fulfillmentType}'`);
    return false;
  }
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected NO line items, got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  if (result.updatedDraft?.jobNameOrPo) {
    console.error(`Expected jobNameOrPo NOT to be set, got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  if (!result.reasons.some((r) => r.includes("slot-answer:fulfillmentType"))) {
    console.error(`Expected reason to include 'slot-answer:fulfillmentType', got ${result.reasons.join(", ")}`);
    return false;
  }
  
  return true;
});

// Test 17: Category labels never create line items
test("Category labels like 'Roofing' never create line items", () => {
  const result = routeIntent({
    threadId: "test-thread-17",
    userMessage: "Roofing",
  });
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected NO line items for category label, got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  return true;
});

// Test 18: Line items deduplication - "100 bundles of shingles and one box of nails"
test("Line items deduplication prevents duplicates", () => {
  const result = routeIntent({
    threadId: "test-thread-18",
    userMessage: "100 bundles of shingles and one box of nails",
  });
  
  if (!result.updatedDraft?.lineItems) {
    console.error("Expected lineItems to be extracted");
    return false;
  }
  
  if (result.updatedDraft.lineItems.length !== 2) {
    console.error(`Expected 2 line items, got ${result.updatedDraft.lineItems.length}`);
    console.error("Items:", JSON.stringify(result.updatedDraft.lineItems, null, 2));
    return false;
  }
  
  // Find shingles item
  const shinglesItem = result.updatedDraft.lineItems.find((item) => 
    item.description.toLowerCase().includes("shingle")
  );
  if (!shinglesItem) {
    console.error("Expected shingles item");
    return false;
  }
  if (shinglesItem.quantity !== 100) {
    console.error(`Expected shingles quantity 100, got ${shinglesItem.quantity}`);
    return false;
  }
  // Unit should be original (bundles) or normalized (bundle) - either is fine
  if (shinglesItem.unit !== "bundles" && shinglesItem.unit !== "bundle") {
    console.error(`Expected shingles unit 'bundles' or 'bundle', got '${shinglesItem.unit}'`);
    return false;
  }
  if (shinglesItem.description.toLowerCase().startsWith("of ")) {
    console.error(`Expected description not to start with 'of ', got '${shinglesItem.description}'`);
    return false;
  }
  
  // Find nails item
  const nailsItem = result.updatedDraft.lineItems.find((item) => 
    item.description.toLowerCase().includes("nail")
  );
  if (!nailsItem) {
    console.error("Expected nails item");
    return false;
  }
  if (nailsItem.quantity !== 1) {
    console.error(`Expected nails quantity 1, got ${nailsItem.quantity}`);
    return false;
  }
  // Unit should be original (box) or normalized - either is fine
  if (nailsItem.unit !== "box" && nailsItem.unit !== "boxes") {
    console.error(`Expected nails unit 'box' or 'boxes', got '${nailsItem.unit}'`);
    return false;
  }
  if (nailsItem.description.toLowerCase().startsWith("of ")) {
    console.error(`Expected description not to start with 'of ', got '${nailsItem.description}'`);
    return false;
  }
  
  // Ensure jobNameOrPo is NOT set
  if (result.updatedDraft.jobNameOrPo) {
    console.error(`Expected jobNameOrPo to be undefined, got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  return true;
});

// Test 19: "Roofing" should not set jobNameOrPo when __lastAskedSlot is not jobNameOrPo
test("'Roofing' should not set jobNameOrPo when __lastAskedSlot is not jobNameOrPo", () => {
  const result = routeIntent({
    threadId: "test-thread-19",
    userMessage: "Roofing",
    currentDraft: {
      // __lastAskedSlot is NOT jobNameOrPo (or undefined)
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    },
  });
  
  if (result.updatedDraft?.jobNameOrPo) {
    console.error(`Expected jobNameOrPo to be undefined, got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  return true;
});

// Test 20: Follow-up line items parsing when __lastAskedSlot is lineItems
test("Follow-up line items parsing when __lastAskedSlot is lineItems", () => {
  const currentDraft: any = {
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "lineItems",
  };
  
  const result = routeIntent({
    threadId: "test-thread-20",
    userMessage: "100 bundles of shingles",
    currentDraft,
  });
  
  if (!result.updatedDraft?.lineItems || result.updatedDraft.lineItems.length === 0) {
    console.error("Expected lineItems to be parsed from follow-up message");
    return false;
  }
  
  const shinglesItem = result.updatedDraft.lineItems.find((item) => 
    item.description.toLowerCase().includes("shingle")
  );
  if (!shinglesItem) {
    console.error("Expected shingles item");
    return false;
  }
  if (shinglesItem.quantity !== 100) {
    console.error(`Expected quantity 100, got ${shinglesItem.quantity}`);
    return false;
  }
  
  // Should NOT ask "How many do you need?" since we parsed line items
  if (result.nextQuestion && result.nextQuestion.toLowerCase().includes("how many")) {
    console.error(`Expected not to ask 'How many', got '${result.nextQuestion}'`);
    return false;
  }
  
  return true;
});

// Test 21: Dedupe case - "shingles" + "of shingles" should collapse to one
test("Dedupe case: 'shingles' + 'of shingles' should collapse to one", () => {
  // This test verifies that if somehow both patterns match and create duplicates,
  // they get deduped correctly
  // Note: The combined pattern may prevent duplicates at extraction time,
  // but if they do get through, dedupeLineItems should sum them
  const result = routeIntent({
    threadId: "test-thread-21",
    userMessage: "10 bundles of shingles and 10 bundles shingles",
  });
  
  if (!result.updatedDraft?.lineItems) {
    console.error("Expected lineItems to be extracted");
    return false;
  }
  
  // Should have only 1 shingles item (either deduped at extraction or by dedupeLineItems)
  const shinglesItems = result.updatedDraft.lineItems.filter((item) => 
    item.description.toLowerCase().includes("shingle")
  );
  
  if (shinglesItems.length !== 1) {
    console.error(`Expected 1 shingles item after dedupe, got ${shinglesItems.length}`);
    return false;
  }
  
  // The combined pattern may prevent duplicates at extraction, so quantity might be 10
  // OR if both match and get deduped, quantity should be 20
  // Both are acceptable - the key is that there's only 1 item
  if (shinglesItems[0].quantity !== 10 && shinglesItems[0].quantity !== 20) {
    console.error(`Expected quantity 10 or 20, got ${shinglesItems[0].quantity}`);
    return false;
  }
  
  return true;
});

// Test 22: Generic roofing request does not create line items and asks for materials/qty
test("Generic roofing request does not create line items and asks for materials/qty", () => {
  const result = routeIntent({
    threadId: "test-thread-22",
    userMessage: "I need roofing materials",
  });
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected no line items for generic request, got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  if (!result.missingSlots.includes("lineItems")) {
    console.error(`Expected missingSlots to include 'lineItems', got ${result.missingSlots.join(", ")}`);
    return false;
  }
  
  // Should ask for line items (materials/qty/quantity/item)
  const questionLower = (result.nextQuestion || "").toLowerCase();
  const asksForLineItems = questionLower.includes("materials") || 
                          questionLower.includes("quantity") || 
                          questionLower.includes("item") ||
                          questionLower.includes("qty") ||
                          questionLower.includes("bundles") ||
                          questionLower.includes("shingles");
  if (!result.nextQuestion || !asksForLineItems) {
    console.error(`Expected nextQuestion to ask for materials/qty/item, got '${result.nextQuestion}'`);
    return false;
  }
  
  if (result.updatedDraft?.lineItems !== undefined && result.updatedDraft.lineItems.length > 0) {
    console.error("Expected lineItems to be undefined or empty");
    return false;
  }
  
  return true;
});

// Test 23: Message equals category label does not create line items
test("Message equals category label does not create line items", () => {
  const result = routeIntent({
    threadId: "test-thread-23",
    userMessage: "Roofing",
    currentDraft: {
      categoryId: "roofing",
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    },
  });
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected no line items for category label, got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  // Should ask for line items if category is already set
  if (result.updatedDraft?.categoryId === "roofing") {
    if (!result.missingSlots.includes("lineItems")) {
      console.error(`Expected missingSlots to include 'lineItems' when category is set, got ${result.missingSlots.join(", ")}`);
      return false;
    }
  }
  
  return true;
});

// Test 24: "need lumber" does not create line items
test("'need lumber' does not create line items", () => {
  const result = routeIntent({
    threadId: "test-thread-24",
    userMessage: "need lumber",
  });
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected no line items for 'need lumber', got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  return true;
});

// Test 25: "I need HVAC supplies" does not create line items
test("'I need HVAC supplies' does not create line items", () => {
  const result = routeIntent({
    threadId: "test-thread-25",
    userMessage: "I need HVAC supplies",
  });
  
  if (result.updatedDraft?.lineItems && result.updatedDraft.lineItems.length > 0) {
    console.error(`Expected no line items for 'I need HVAC supplies', got ${result.updatedDraft.lineItems.length}`);
    return false;
  }
  
  return true;
});

// Test: Category inference from "materials for a roof"
test("'materials for a roof' sets categoryId=roofing without asking category", () => {
  const result = routeIntent({
    threadId: "test-category-inference",
    userMessage: "I need materials for a roof",
  });
  
  if (result.updatedDraft?.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${result.updatedDraft?.categoryId}'`);
    return false;
  }
  
  if (result.missingSlots.includes("categoryId")) {
    console.error("Expected categoryId to be set, but it's in missingSlots");
    return false;
  }
  
  // Should ask for fulfillment or needBy, NOT category
  if (result.nextQuestion && result.nextQuestion.toLowerCase().includes("category")) {
    console.error(`Expected nextQuestion to NOT ask for category, got '${result.nextQuestion}'`);
    return false;
  }
  
  return true;
});

// Test: "need 10 bundles of shingles" sets categoryId=roofing if empty
test("'need 10 bundles of shingles' sets categoryId=roofing if empty", () => {
  const result = routeIntent({
    threadId: "test-shingles-category",
    userMessage: "need 10 bundles of shingles",
  });
  
  if (result.updatedDraft?.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${result.updatedDraft?.categoryId}'`);
    return false;
  }
  
  return true;
});

// Test: Need-by parsing (ASAP/Today/Tomorrow/date)
test("'ASAP' sets needBy=ASAP", () => {
  const result = routeIntent({
    threadId: "test-needby-asap",
    userMessage: "ASAP",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundle" }],
    },
  });
  
  if (result.updatedDraft?.needBy !== "ASAP") {
    console.error(`Expected needBy 'ASAP', got '${result.updatedDraft?.needBy}'`);
    return false;
  }
  
  return true;
});

test("'Today' sets needBy=ASAP", () => {
  const result = routeIntent({
    threadId: "test-needby-today",
    userMessage: "Today",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundle" }],
    },
  });
  
  if (result.updatedDraft?.needBy !== "ASAP") {
    console.error(`Expected needBy 'ASAP', got '${result.updatedDraft?.needBy}'`);
    return false;
  }
  
  return true;
});

test("'Tomorrow' sets needBy to tomorrow's date", () => {
  const result = routeIntent({
    threadId: "test-needby-tomorrow",
    userMessage: "Tomorrow",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundle" }],
    },
  });
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const expectedDate = tomorrow.toISOString().split("T")[0];
  
  if (result.updatedDraft?.needBy !== expectedDate) {
    console.error(`Expected needBy '${expectedDate}', got '${result.updatedDraft?.needBy}'`);
    return false;
  }
  
  return true;
});

test("'1/15/26' sets needBy to parsed date", () => {
  const result = routeIntent({
    threadId: "test-needby-date",
    userMessage: "1/15/26",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundle" }],
    },
  });
  
  // Should parse as 2026-01-15
  if (result.updatedDraft?.needBy !== "2026-01-15") {
    console.error(`Expected needBy '2026-01-15', got '${result.updatedDraft?.needBy}'`);
    return false;
  }
  
  return true;
});

// Test: Multi-line items - "also need..." should merge
test("'also need 1 box of nails' merges with existing line items", () => {
  const result = routeIntent({
    threadId: "test-multi-line-items",
    userMessage: "also need 1 box of nails",
    currentDraft: {
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundle" }],
    },
  });
  
  if (!result.updatedDraft?.lineItems || result.updatedDraft.lineItems.length < 1) {
    console.error(`Expected at least 1 line item, got ${result.updatedDraft?.lineItems?.length || 0}`);
    return false;
  }
  
  // The slotFiller will merge, so we just verify lineItems are present
  // The actual merging happens in slotFiller, not router
  const hasNails = result.updatedDraft.lineItems.some(item => 
    item.description.toLowerCase().includes("nail")
  );
  
  if (!hasNails) {
    console.error(`Expected nails in line items, got: ${result.updatedDraft.lineItems.map(i => i.description).join(", ")}`);
    return false;
  }
  
  return true;
});

// G1: Test __lastAskedSlot=jobNameOrPo + message "Agent V1 Test" => jobNameOrPo set, nextQuestion advances
test("jobNameOrPo follow-up: 'Agent V1 Test' sets jobNameOrPo", () => {
  const result = routeIntent({
    threadId: "test-thread-job-po",
    userMessage: "Agent V1 Test",
    currentDraft: {
      __lastAskedSlot: "jobNameOrPo",
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundles" }],
    },
  });
  
  if (result.updatedDraft?.jobNameOrPo !== "Agent V1 Test") {
    console.error(`Expected jobNameOrPo 'Agent V1 Test', got '${result.updatedDraft?.jobNameOrPo}'`);
    return false;
  }
  
  // Should not ask for jobNameOrPo again
  if (result.missingSlots.includes("jobNameOrPo")) {
    console.error("Expected jobNameOrPo to NOT be in missing slots");
    return false;
  }
  
  return true;
});

// G1: Test __lastAskedSlot=jobNameOrPo + message "yes" => asks "What should I label it as?"
test("jobNameOrPo follow-up: 'yes' asks for label", () => {
  const result = routeIntent({
    threadId: "test-thread-job-po-yes",
    userMessage: "yes",
    currentDraft: {
      __lastAskedSlot: "jobNameOrPo",
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "shingles", quantity: 10, unit: "bundles" }],
    },
  });
  
  // Should NOT set jobNameOrPo from "yes"
  if (result.updatedDraft?.jobNameOrPo) {
    console.error(`Expected jobNameOrPo to NOT be set from 'yes', got '${result.updatedDraft.jobNameOrPo}'`);
    return false;
  }
  
  // Should ask for job name/PO
  if (!result.nextQuestion || !result.nextQuestion.toLowerCase().includes("label")) {
    console.error(`Expected nextQuestion to ask for label, got '${result.nextQuestion}'`);
    return false;
  }
  
  return true;
});

// G1: Test "100 bundles of shingles and one box of nails" => 2 lineItems, no "of " prefix, no duplicates, jobNameOrPo remains undefined
test("Line items: '100 bundles of shingles and one box of nails' => 2 items, normalized, no duplicates, no jobNameOrPo", () => {
  const result = routeIntent({
    threadId: "test-thread-line-items",
    userMessage: "100 bundles of shingles and one box of nails",
    currentDraft: {
      __lastAskedSlot: "lineItems",
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
    },
  });
  
  if (!result.updatedDraft?.lineItems || result.updatedDraft.lineItems.length !== 2) {
    console.error(`Expected 2 line items, got ${result.updatedDraft?.lineItems?.length || 0}`);
    return false;
  }
  
  // Check first item (shingles)
  const shinglesItem = result.updatedDraft.lineItems.find(item => 
    item.description.toLowerCase().includes("shingle")
  );
  if (!shinglesItem || shinglesItem.quantity !== 100) {
    console.error(`Expected shingles item with qty 100, got ${JSON.stringify(shinglesItem)}`);
    return false;
  }
  if (shinglesItem.description.toLowerCase().startsWith("of ")) {
    console.error(`Expected description NOT to start with 'of ', got '${shinglesItem.description}'`);
    return false;
  }
  
  // Check second item (nails)
  const nailsItem = result.updatedDraft.lineItems.find(item => 
    item.description.toLowerCase().includes("nail")
  );
  if (!nailsItem || nailsItem.quantity !== 1) {
    console.error(`Expected nails item with qty 1, got ${JSON.stringify(nailsItem)}`);
    return false;
  }
  if (nailsItem.description.toLowerCase().startsWith("of ")) {
    console.error(`Expected description NOT to start with 'of ', got '${nailsItem.description}'`);
    return false;
  }
  
  // jobNameOrPo should remain undefined
  if (result.updatedDraft.jobNameOrPo) {
    console.error(`Expected jobNameOrPo to be undefined, got '${result.updatedDraft.jobNameOrPo}'`);
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

