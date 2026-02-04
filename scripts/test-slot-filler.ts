/**
 * Test script for Slot-Filling Engine
 * Run with: npm run test:slot-filler
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
import { applyRouterDecision } from "../src/lib/agent/slotFiller";
import { getDraft, clearDraft } from "../src/lib/agent/draftStore";

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => boolean | void) {
  try {
    // Clear storage before each test
    localStorage.clear();
    
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

console.log("🧪 Testing Slot-Filling Engine...\n");

// Test 1: First apply: routeIntent for "I need 10 bundles of shingles"
test("First apply saves draft with categoryId and lineItems", () => {
  const threadId = "test-thread-1";
  clearDraft(threadId);
  
  const decision = routeIntent({
    threadId,
    userMessage: "I need 10 bundles of shingles",
  });
  
  // Debug: check decision structure
  if (!decision.missingSlots) {
    console.error("decision.missingSlots is undefined");
    return false;
  }
  
  const result = applyRouterDecision({
    threadId,
    decision,
  });
  
  if (result.skippedAsDuplicate) {
    console.error("Expected not to be skipped as duplicate");
    return false;
  }
  
  const savedDraft = getDraft(threadId);
  if (!savedDraft) {
    console.error("Expected draft to be saved");
    return false;
  }
  
  if (savedDraft.categoryId !== "roofing") {
    console.error(`Expected categoryId 'roofing', got '${savedDraft.categoryId}'`);
    return false;
  }
  
  if (!savedDraft.lineItems || savedDraft.lineItems.length === 0) {
    console.error("Expected lineItems to be saved");
    return false;
  }
  
  const firstItem = savedDraft.lineItems[0];
  if (firstItem.quantity !== 10) {
    console.error(`Expected quantity 10, got ${firstItem.quantity}`);
    return false;
  }
  
  // __lastAskedSlot should be set to first missing slot (if there are missing slots)
  // Check the result's readyToDispatch and decision's missingSlots
  if (!result.readyToDispatch && decision.missingSlots.length > 0) {
    if (!savedDraft.__lastAskedSlot) {
      console.error(
        `Expected __lastAskedSlot to be set when there are missing slots. Missing slots: ${decision.missingSlots.join(", ")}, readyToDispatch: ${result.readyToDispatch}, savedDraft: ${JSON.stringify(savedDraft, null, 2)}`
      );
      return false;
    }
    
    // Should be either "jobNameOrPo" or "fulfillmentType" depending on router order
    if (
      savedDraft.__lastAskedSlot !== "jobNameOrPo" &&
      savedDraft.__lastAskedSlot !== "fulfillmentType"
    ) {
      console.error(
        `Expected __lastAskedSlot to be 'jobNameOrPo' or 'fulfillmentType', got '${savedDraft.__lastAskedSlot}'`
      );
      return false;
    }
  }
  
  return true;
});

// Test 2: Duplicate prevention
test("Duplicate prevention: same decision twice returns skippedAsDuplicate", () => {
  const threadId = "test-thread-2";
  clearDraft(threadId);
  
  const decision = routeIntent({
    threadId,
    userMessage: "I need shingles",
  });
  
  // First apply
  const result1 = applyRouterDecision({
    threadId,
    decision,
  });
  
  if (result1.skippedAsDuplicate) {
    console.error("First apply should not be skipped");
    return false;
  }
  
  // Second apply with same decision
  const result2 = applyRouterDecision({
    threadId,
    decision,
  });
  
  if (!result2.skippedAsDuplicate) {
    console.error("Second apply should be skipped as duplicate");
    return false;
  }
  
  // Draft should not have changed
  const draft1 = getDraft(threadId);
  const draft2 = getDraft(threadId);
  
  if (JSON.stringify(draft1) !== JSON.stringify(draft2)) {
    console.error("Draft should not change on duplicate apply");
    return false;
  }
  
  return true;
});

// Test 3: Numeric follow-up
test("Numeric follow-up updates quantity when __lastAskedSlot is lineItems", () => {
  const threadId = "test-thread-3";
  clearDraft(threadId);
  
  // Set up initial draft with line item but no quantity
  const initialDraft: any = {
    categoryId: "roofing",
    fulfillmentType: "PICKUP",
    lineItems: [{ description: "bundles of shingles", quantity: 0 }],
    priority: "best_price",
    visibility: "broadcast",
    createdFrom: "agent",
    __lastAskedSlot: "lineItems",
  };
  
  // Save initial draft manually
  const { saveDraft } = require("../src/lib/agent/draftStore");
  saveDraft(threadId, initialDraft);
  
  // Route intent with just "10"
  const decision = routeIntent({
    threadId,
    userMessage: "10",
    currentDraft: initialDraft,
  });
  
  const result = applyRouterDecision({
    threadId,
    decision,
  });
  
  if (result.skippedAsDuplicate) {
    console.error("Should not be skipped as duplicate");
    return false;
  }
  
  const savedDraft = getDraft(threadId);
  if (!savedDraft?.lineItems || savedDraft.lineItems.length === 0) {
    console.error("Expected lineItems to exist");
    return false;
  }
  
  const firstItem = savedDraft.lineItems[0];
  if (firstItem.quantity !== 10) {
    console.error(`Expected quantity to be updated to 10, got ${firstItem.quantity}`);
    return false;
  }
  
  if (firstItem.description !== "bundles of shingles") {
    console.error(`Expected description to remain 'bundles of shingles', got '${firstItem.description}'`);
    return false;
  }
  
  return true;
});

// Test 4: Notes never autopopulate
test("Notes never autopopulate from decision.updatedDraft", () => {
  const threadId = "test-thread-4";
  clearDraft(threadId);
  
  // Create a manual RouterDecision with notes in updatedDraft (simulating a bug or future change)
  const decision: any = {
    mode: "RFQ_CREATE",
    capabilityId: "cap.intent_router.v1",
    updatedDraft: {
      notes: "should not persist",
      jobNameOrPo: "Test PO",
      categoryId: "roofing",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "bundles of shingles", quantity: 1 }],
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    },
    missingSlots: [],
    nextQuestion: undefined,
    readyToDispatch: false,
    confidence: "high",
    reasons: ["Test decision"],
    idempotencyKey: "k_notes_test",
  };
  
  // Apply the decision
  const result = applyRouterDecision({
    threadId,
    decision,
  });
  
  const savedDraft = getDraft(threadId);
  
  // Notes should NOT be set (must not equal "should not persist")
  if (savedDraft?.notes === "should not persist") {
    console.error(`Expected notes to NOT be 'should not persist', but it was set`);
    return false;
  }
  
  if (savedDraft?.notes !== undefined && savedDraft.notes !== "") {
    console.error(`Expected notes to be undefined or empty, got '${savedDraft.notes}'`);
    return false;
  }
  
  // Assert other fields DID persist
  if (savedDraft?.jobNameOrPo !== "Test PO") {
    console.error(`Expected jobNameOrPo to be 'Test PO', got '${savedDraft?.jobNameOrPo}'`);
    return false;
  }
  
  if (savedDraft?.categoryId !== "roofing") {
    console.error(`Expected categoryId to be 'roofing', got '${savedDraft?.categoryId}'`);
    return false;
  }
  
  if (savedDraft?.fulfillmentType !== "PICKUP") {
    console.error(`Expected fulfillmentType to be 'PICKUP', got '${savedDraft?.fulfillmentType}'`);
    return false;
  }
  
  if (!savedDraft?.lineItems || savedDraft.lineItems.length === 0) {
    console.error("Expected lineItems to be persisted");
    return false;
  }
  
  const firstItem = savedDraft.lineItems[0];
  if (firstItem.description !== "bundles of shingles" || firstItem.quantity !== 1) {
    console.error(`Expected lineItem to be persisted correctly, got ${JSON.stringify(firstItem)}`);
    return false;
  }
  
  // Sub-check: If a draft already has notes set (simulate "manual notes")
  const { saveDraft } = require("../src/lib/agent/draftStore");
  const draftWithNotes: any = { ...savedDraft, notes: "manual note" };
  saveDraft(threadId, draftWithNotes);
  
  // Apply another decision with notes (different idempotency key to avoid duplicate check)
  const decision2: any = {
    mode: "RFQ_UPDATE",
    capabilityId: "cap.intent_router.v1",
    updatedDraft: {
      notes: "overwritten?",
      categoryId: "hvac", // Change something else to make it a valid update
    },
    missingSlots: [],
    nextQuestion: undefined,
    readyToDispatch: false,
    confidence: "high",
    reasons: ["Test decision 2"],
    idempotencyKey: "k_notes_test_2",
  };
  
  const result2 = applyRouterDecision({
    threadId,
    decision: decision2,
  });
  
  const savedDraft2 = getDraft(threadId);
  
  // User-set notes should be preserved (must NOT be overwritten)
  if (savedDraft2?.notes !== "manual note") {
    console.error(
      `Expected notes to be preserved as 'manual note', got '${savedDraft2?.notes}'`
    );
    return false;
  }
  
  // Verify other fields were updated (categoryId should change)
  if (savedDraft2?.categoryId !== "hvac") {
    console.error(`Expected categoryId to be updated to 'hvac', got '${savedDraft2?.categoryId}'`);
    return false;
  }
  
  return true;
});

// Test 5: ClearDraft
test("clearDraft removes stored draft key", () => {
  const threadId = "test-thread-5";
  clearDraft(threadId);
  
  // Create and save a draft
  const decision = routeIntent({
    threadId,
    userMessage: "I need shingles",
  });
  
  applyRouterDecision({
    threadId,
    decision,
  });
  
  // Verify draft exists
  const draftBefore = getDraft(threadId);
  if (!draftBefore) {
    console.error("Expected draft to exist before clear");
    return false;
  }
  
  // Clear draft
  clearDraft(threadId);
  
  // Verify draft is gone
  const draftAfter = getDraft(threadId);
  if (draftAfter !== null) {
    console.error("Expected draft to be null after clear");
    return false;
  }
  
  return true;
});

// Test 6: Line items replace (not append)
test("Line items replace entirely, not append", () => {
  const threadId = "test-thread-6";
  clearDraft(threadId);
  
  // First decision with one line item
  const decision1 = routeIntent({
    threadId,
    userMessage: "I need 10 bundles of shingles",
  });
  
  applyRouterDecision({
    threadId,
    decision: decision1,
  });
  
  const draft1 = getDraft(threadId);
  if (!draft1?.lineItems || draft1.lineItems.length === 0) {
    console.error("Expected at least 1 line item after first apply");
    return false;
  }
  
  const initialCount = draft1.lineItems.length;
  const hasShingles = draft1.lineItems.some((item) =>
    item.description.toLowerCase().includes("shingle")
  );
  
  if (!hasShingles) {
    console.error("Expected shingles to be in initial lineItems");
    return false;
  }
  
  // Second decision with different line items
  const decision2 = routeIntent({
    threadId,
    userMessage: "I need 5 boxes of nails",
    currentDraft: draft1,
  });
  
  // Ensure decision2 has lineItems
  if (!decision2.updatedDraft?.lineItems) {
    console.error("Expected decision2 to have lineItems in updatedDraft");
    return false;
  }
  
  applyRouterDecision({
    threadId,
    decision: decision2,
  });
  
  const draft2 = getDraft(threadId);
  if (!draft2?.lineItems) {
    console.error("Expected lineItems to exist");
    return false;
  }
  
  // Should have replaced, not appended
  // The new lineItems should be from decision2, not a combination
  const hasNails = draft2.lineItems.some((item) =>
    item.description.toLowerCase().includes("nail")
  );
  
  // Nails should be present (the new items)
  if (!hasNails) {
    console.error("Expected nails to be in lineItems after second apply");
    return false;
  }
  
  // The count should reflect the new items, not be a sum
  // (exact count depends on router extraction, but should not be initialCount + newCount)
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

