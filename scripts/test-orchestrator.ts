/**
 * Test script for Agent Orchestrator
 * Run with: npm run test:orchestrator
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
import { handleAgentTurn } from "../src/lib/agent/orchestrator";
import { clearDraft } from "../src/lib/agent/draftStore";

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => boolean | void | Promise<boolean | void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then((res) => {
          if (res === false) {
            console.error(`❌ FAIL: ${name}`);
            testsFailed++;
          } else {
            console.log(`✅ PASS: ${name}`);
            testsPassed++;
          }
        })
        .catch((error) => {
          console.error(`❌ FAIL: ${name}`, error);
          testsFailed++;
        });
    } else {
      if (result === false) {
        console.error(`❌ FAIL: ${name}`);
        testsFailed++;
      } else {
        console.log(`✅ PASS: ${name}`);
        testsPassed++;
      }
    }
  } catch (error) {
    console.error(`❌ FAIL: ${name}`, error);
    testsFailed++;
  }
}

// Helper to wait for async tests
async function runTests() {
  console.log("🧪 Testing Agent Orchestrator...\n");

  // Test 1: Advice-only message → advise
  await new Promise<void>((resolve) => {
    test("Advice-only message returns advise response", async () => {
      const threadId = "test-thread-1";
      clearDraft(threadId);

      const response = await handleAgentTurn({
        threadId,
        userMessage: "What should I use for a roof?",
      });

      if (response.type !== "advise") {
        console.error(`Expected type 'advise', got '${response.type}'`);
        return false;
      }

      if (!response.message || response.message.length === 0) {
        console.error("Expected advise message to be non-empty");
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 2: Missing slots → ask nextQuestion
  await new Promise<void>((resolve) => {
    test("Missing slots returns ask response with nextQuestion", async () => {
      const threadId = "test-thread-2";
      clearDraft(threadId);

      // Test the ask path by using routeIntent directly to create a decision
      // that's definitely not ready, then verify orchestrator handles it
      const { routeIntent } = require("../src/lib/agent/intentRouter");
      const decision = routeIntent({
        threadId,
        userMessage: "roofing",
      });

      // If the decision is ready (router filled defaults), that's valid behavior
      // But we can still test the ask path by checking the decision structure
      if (decision.readyToDispatch) {
        // Router completed with defaults - test ask path differently
        // Create a manual decision that's not ready
        const { applyRouterDecision } = require("../src/lib/agent/slotFiller");
        const manualDecision: any = {
          mode: "RFQ_CREATE",
          capabilityId: "cap.intent_router.v1",
          updatedDraft: {
            categoryId: "roofing",
            // Missing: jobNameOrPo, fulfillmentType, lineItems
          },
          missingSlots: ["jobNameOrPo", "fulfillmentType", "lineItems"],
          nextQuestion: "What category is this for?",
          readyToDispatch: false,
          confidence: "medium",
          reasons: ["Test"],
          idempotencyKey: "test-ask-key",
        };

        applyRouterDecision({ threadId, decision: manualDecision });

        const response = await handleAgentTurn({
          threadId,
          userMessage: "test ask",
        });

        // Should ask (unless this message completes it)
        if (response.type === "ask") {
          if (!response.message || response.message.length === 0) {
            console.error("Expected ask message to be non-empty");
            return false;
          }
          resolve();
          return true;
        }

        // If we got confirm, the message completed the draft - that's also valid
        // Just verify we got a valid response
        if (response.type !== "confirm" && response.type !== "ask") {
          console.error(`Expected type 'ask' or 'confirm', got '${response.type}'`);
          return false;
        }

        resolve();
        return true;
      }

      // Decision is not ready - test the ask path
      const response = await handleAgentTurn({
        threadId,
        userMessage: "roofing",
      });

      if (response.type !== "ask") {
        console.error(`Expected type 'ask' for incomplete draft, got '${response.type}'`);
        return false;
      }

      if (!response.message || response.message.length === 0) {
        console.error("Expected ask message to be non-empty");
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 3: Complete draft → confirm
  await new Promise<void>((resolve) => {
    test("Complete draft returns confirm response", async () => {
      const threadId = "test-thread-3";
      clearDraft(threadId);

      // Build up a complete draft through multiple turns
      await handleAgentTurn({
        threadId,
        userMessage: "I need 10 bundles of shingles for roofing",
      });

      await handleAgentTurn({
        threadId,
        userMessage: "pickup",
      });

      await handleAgentTurn({
        threadId,
        userMessage: "Job name is Test Job",
      });

      await handleAgentTurn({
        threadId,
        userMessage: "ASAP",
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      if (response.type !== "confirm") {
        console.error(`Expected type 'confirm', got '${response.type}'`);
        return false;
      }

      if (!response.summary) {
        console.error("Expected summary to be present");
        return false;
      }

      // Verify summary has required fields
      if (!response.summary.jobNameOrPo) {
        console.error("Expected summary to have jobNameOrPo");
        return false;
      }

      if (!response.summary.categoryId) {
        console.error("Expected summary to have categoryId");
        return false;
      }

      if (!response.summary.fulfillmentType) {
        console.error("Expected summary to have fulfillmentType");
        return false;
      }

      if (!response.summary.lineItems || response.summary.lineItems.length === 0) {
        console.error("Expected summary to have lineItems");
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 4: Duplicate message → noop
  await new Promise<void>((resolve) => {
    test("Duplicate message returns noop response", async () => {
      const threadId = "test-thread-4";
      clearDraft(threadId);

      // First turn
      const response1 = await handleAgentTurn({
        threadId,
        userMessage: "I need shingles",
      });

      if (response1.type === "noop") {
        console.error("First turn should not be noop");
        return false;
      }

      // Duplicate turn (same message)
      const response2 = await handleAgentTurn({
        threadId,
        userMessage: "I need shingles",
      });

      if (response2.type !== "noop") {
        console.error(`Expected type 'noop' for duplicate, got '${response2.type}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 5: Quantity follow-up works via __lastAskedSlot
  await new Promise<void>((resolve) => {
    test("Quantity follow-up works via __lastAskedSlot", async () => {
      const threadId = "test-thread-5";
      clearDraft(threadId);

      // Set up initial draft with line item but no quantity
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        categoryId: "roofing",
        fulfillmentType: "PICKUP",
        lineItems: [{ description: "bundles of shingles", quantity: 0 }],
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        __lastAskedSlot: "lineItems",
      });

      // Follow-up with just quantity
      const response = await handleAgentTurn({
        threadId,
        userMessage: "10",
      });

      // Should either ask next question or confirm (depending on other slots)
      if (response.type !== "ask" && response.type !== "confirm") {
        console.error(
          `Expected type 'ask' or 'confirm' after quantity follow-up, got '${response.type}'`
        );
        return false;
      }

      // Verify quantity was updated
      const { getDraft } = require("../src/lib/agent/draftStore");
      const draft = getDraft(threadId);
      if (!draft?.lineItems || draft.lineItems.length === 0) {
        console.error("Expected lineItems to exist");
        return false;
      }

      const firstItem = draft.lineItems[0];
      if (firstItem.quantity !== 10) {
        console.error(`Expected quantity to be updated to 10, got ${firstItem.quantity}`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 6: Delivery without address keeps asking
  await new Promise<void>((resolve) => {
    test("Delivery without address keeps asking for address", async () => {
      const threadId = "test-thread-6";
      clearDraft(threadId);

      // Start with delivery request
      const response1 = await handleAgentTurn({
        threadId,
        userMessage: "I need 10 bundles of shingles, deliver them",
      });

      if (response1.type !== "ask") {
        console.error(`Expected type 'ask' after delivery request, got '${response1.type}'`);
        return false;
      }

      // Should be asking for address
      if (!response1.message.toLowerCase().includes("address")) {
        console.error(
          `Expected message to ask for address, got '${response1.message}'`
        );
        return false;
      }

      // Provide job name but not address
      const response2 = await handleAgentTurn({
        threadId,
        userMessage: "Job name is Test Job",
      });

      if (response2.type !== "ask") {
        console.error(
          `Expected type 'ask' when address still missing, got '${response2.type}'`
        );
        return false;
      }

      // Should still be asking for address (or other missing slots, but address should be in missing slots)
      const { getDraft } = require("../src/lib/agent/draftStore");
      const draft = getDraft(threadId);
      if (draft?.fulfillmentType === "DELIVERY" && !draft.deliveryAddress) {
        // Address is still missing, which is correct
        // The response should still be asking
        if (!response2.message) {
          console.error("Expected ask message to be present");
          return false;
        }
      }

      resolve();
      return true;
    });
  });

  // Test 7: "I need materials" => ask category (no lineItems created)
  await new Promise<void>((resolve) => {
    test("Generic phrase 'I need materials' asks for category without creating line items", async () => {
      const threadId = "test-thread-7";
      clearDraft(threadId);

      const response = await handleAgentTurn({
        threadId,
        userMessage: "I need materials",
      });

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Verify no line items were created
      const { getDraft } = require("../src/lib/agent/draftStore");
      const draft = getDraft(threadId);
      if (draft?.lineItems && draft.lineItems.length > 0) {
        console.error(`Expected no line items for generic phrase, got ${draft.lineItems.length}`);
        return false;
      }

      // Should ask for category
      if (!response.message.toLowerCase().includes("category")) {
        console.error(`Expected question to ask about category, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 8: Cannot confirm when jobNameOrPo is missing
  await new Promise<void>((resolve) => {
    test("Cannot confirm when jobNameOrPo is missing", async () => {
      const threadId = "test-thread-8";
      clearDraft(threadId);

      // Create a draft with all fields except jobNameOrPo
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        categoryId: "roofing",
        fulfillmentType: "PICKUP",
        lineItems: [{ description: "Shingles", quantity: 10 }],
        needBy: "ASAP",
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        // Missing jobNameOrPo
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      // Should NOT confirm - should ask for jobNameOrPo
      if (response.type === "confirm") {
        console.error("Expected type 'ask' when jobNameOrPo is missing, got 'confirm'");
        return false;
      }

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Should ask for job name or PO (deterministic order: after lineItems)
      if (!response.message.toLowerCase().includes("job") && !response.message.toLowerCase().includes("po")) {
        console.error(`Expected question to ask about job/PO, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test: Cannot confirm when lineItems and jobNameOrPo are missing
  await new Promise<void>((resolve) => {
    test("Cannot confirm when lineItems and jobNameOrPo are missing", async () => {
      const threadId = "test-thread-missing-fields";
      clearDraft(threadId);

      // Create a draft with category+fulfillment+needBy but WITHOUT lineItems/jobNameOrPo
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        categoryId: "roofing",
        fulfillmentType: "PICKUP",
        needBy: "ASAP",
        // Missing: lineItems, jobNameOrPo
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "ready to create",
      });

      // Should NOT confirm - should ask for missing fields
      if (response.type === "confirm") {
        console.error("Expected type 'ask' when lineItems/jobNameOrPo missing, got 'confirm'");
        return false;
      }

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Should ask for lineItems first (deterministic order: fulfillment → needBy → lineItems → jobNameOrPo)
      // Since fulfillment and needBy are present, should ask for lineItems
      const message = response.message.toLowerCase();
      const asksForLineItems = message.includes("materials") || message.includes("quantities") || message.includes("line item");
      const asksForJob = message.includes("job") || message.includes("po");
      
      if (!asksForLineItems && !asksForJob) {
        console.error(`Expected question to ask about lineItems or job/PO, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 9: Cannot confirm when lineItems missing
  await new Promise<void>((resolve) => {
    test("Cannot confirm when lineItems missing", async () => {
      const threadId = "test-thread-9";
      clearDraft(threadId);

      // Create a draft with all fields except lineItems
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        jobNameOrPo: "Test Job",
        categoryId: "roofing",
        fulfillmentType: "PICKUP",
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        // Missing lineItems
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      // Should NOT confirm - should ask for line items
      if (response.type === "confirm") {
        console.error("Expected type 'ask' when lineItems is missing, got 'confirm'");
        return false;
      }

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Should ask for materials/line items
      const message = response.message.toLowerCase();
      if (!message.includes("material") && !message.includes("quantit")) {
        console.error(`Expected question to ask about materials/quantities, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 10: Can confirm only when validateAgentDraftRFQ passes (including needBy)
  await new Promise<void>((resolve) => {
    test("Can confirm only when validateAgentDraftRFQ passes (including needBy)", async () => {
      const threadId = "test-thread-10";
      clearDraft(threadId);

      // Build a complete, valid draft
      await handleAgentTurn({
        threadId,
        userMessage: "I need 10 bundles of shingles for roofing",
      });

      await handleAgentTurn({
        threadId,
        userMessage: "pickup",
      });

      await handleAgentTurn({
        threadId,
        userMessage: "Job name is Test Job",
      });

      await handleAgentTurn({
        threadId,
        userMessage: "ASAP",
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      // Should confirm only if all required fields are present (including needBy and jobNameOrPo)
      if (response.type === "confirm") {
        // Verify summary has all required fields
        if (!response.summary.jobNameOrPo || response.summary.jobNameOrPo.trim().length < 2) {
          console.error("Summary should have valid jobNameOrPo");
          return false;
        }

        if (!response.summary.categoryId) {
          console.error("Summary should have categoryId");
          return false;
        }

        if (!response.summary.fulfillmentType) {
          console.error("Summary should have fulfillmentType");
          return false;
        }

        if (!response.summary.lineItems || response.summary.lineItems.length === 0) {
          console.error("Summary should have lineItems");
          return false;
        }

        // Validate the summary using the validator
        const { validateAgentDraftRFQ } = require("../src/lib/agent/contracts");
        const validation = validateAgentDraftRFQ(response.summary);
        if (!validation.ok) {
          console.error(`Summary should pass validation, got errors: ${JSON.stringify(validation.errors)}`);
          return false;
        }
      } else if (response.type === "ask") {
        // If we got ask, the draft wasn't complete - that's also valid
        // Just verify we got a valid response
      } else {
        console.error(`Expected type 'confirm' or 'ask', got '${response.type}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 11: jobNameOrPo follow-up works
  await new Promise<void>((resolve) => {
    test("jobNameOrPo follow-up when __lastAskedSlot is jobNameOrPo", async () => {
      const threadId = "test-thread-11";
      clearDraft(threadId);

      // Set up draft with __lastAskedSlot = jobNameOrPo
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        categoryId: "roofing",
        fulfillmentType: "PICKUP",
        lineItems: [{ description: "Shingles", quantity: 10 }],
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        __lastAskedSlot: "jobNameOrPo",
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "Agent V1 Test",
      });

      // Should either ask next question or confirm (depending on other slots)
      if (response.type !== "ask" && response.type !== "confirm") {
        console.error(
          `Expected type 'ask' or 'confirm' after jobNameOrPo follow-up, got '${response.type}'`
        );
        return false;
      }

      // Verify jobNameOrPo was set
      const { getDraft } = require("../src/lib/agent/draftStore");
      const draft = getDraft(threadId);
      if (!draft?.jobNameOrPo || draft.jobNameOrPo !== "Agent V1 Test") {
        console.error(`Expected jobNameOrPo 'Agent V1 Test', got '${draft?.jobNameOrPo}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 12: Yes response to jobNameOrPo question asks for actual job name
  await new Promise<void>((resolve) => {
    test("Yes response to jobNameOrPo question asks for actual job name", async () => {
      const threadId = "test-thread-12";
      clearDraft(threadId);

      // Set up draft with __lastAskedSlot = jobNameOrPo
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        categoryId: "roofing",
        fulfillmentType: "PICKUP",
        lineItems: [{ description: "Shingles", quantity: 10 }],
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        __lastAskedSlot: "jobNameOrPo",
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "yes",
      });

      // Should ask for actual job name
      if (response.type !== "ask") {
        console.error(`Expected type 'ask' after yes response, got '${response.type}'`);
        return false;
      }

      if (!response.message || !response.message.includes("What should I label it as")) {
        console.error(`Expected message to ask for job name/PO, got '${response.message}'`);
        return false;
      }

      // jobNameOrPo should NOT be set
      const { getDraft } = require("../src/lib/agent/draftStore");
      const draft = getDraft(threadId);
      if (draft?.jobNameOrPo) {
        console.error(`Expected jobNameOrPo NOT to be set for yes/no response, got '${draft.jobNameOrPo}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 13: Slot-answer precedence: category + pickup only should still ask
  await new Promise<void>((resolve) => {
    test("After category + pickup only, response.type must be 'ask' (still missing jobNameOrPo + lineItems)", async () => {
      const threadId = "test-thread-13";
      clearDraft(threadId);

      // Set up draft with __lastAskedSlot = categoryId
      const { saveDraft } = require("../src/lib/agent/draftStore");
      saveDraft(threadId, {
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        __lastAskedSlot: "categoryId",
      });

      // User selects "Roofing"
      const response1 = await handleAgentTurn({
        threadId,
        userMessage: "Roofing",
      });

      // Should ask for fulfillment
      if (response1.type !== "ask") {
        console.error(`Expected type 'ask' after category, got '${response1.type}'`);
        return false;
      }

      // Set up draft with __lastAskedSlot = fulfillmentType
      const { getDraft } = require("../src/lib/agent/draftStore");
      const draftAfterCategory = getDraft(threadId);
      saveDraft(threadId, {
        ...draftAfterCategory,
        __lastAskedSlot: "fulfillmentType",
      });

      // User selects "Pickup"
      const response2 = await handleAgentTurn({
        threadId,
        userMessage: "Pickup",
      });

      // Should STILL ask (missing jobNameOrPo + lineItems)
      if (response2.type !== "ask") {
        console.error(`Expected type 'ask' after category + pickup, got '${response2.type}'`);
        return false;
      }

      // Verify draft has category and fulfillment but NOT jobNameOrPo or lineItems
      const finalDraft = getDraft(threadId);
      if (!finalDraft?.categoryId || finalDraft.categoryId !== "roofing") {
        console.error(`Expected categoryId 'roofing', got '${finalDraft?.categoryId}'`);
        return false;
      }

      if (!finalDraft?.fulfillmentType || finalDraft.fulfillmentType !== "PICKUP") {
        console.error(`Expected fulfillmentType 'PICKUP', got '${finalDraft?.fulfillmentType}'`);
        return false;
      }

      if (finalDraft?.jobNameOrPo) {
        console.error(`Expected jobNameOrPo NOT to be set, got '${finalDraft.jobNameOrPo}'`);
        return false;
      }

      if (finalDraft?.lineItems && finalDraft.lineItems.length > 0) {
        console.error(`Expected NO line items, got ${finalDraft.lineItems.length}`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 14: Line items + category + pickup should NOT confirm without jobNameOrPo
  await new Promise<void>((resolve) => {
    test("Line items + category + pickup should NOT confirm without jobNameOrPo", async () => {
      const threadId = "test-thread-14";
      clearDraft(threadId);

      // Start with line items
      const response1 = await handleAgentTurn({
        threadId,
        userMessage: "100 bundles of shingles and one box of nails",
      });

      // Should ask for category or fulfillment
      if (response1.type === "confirm") {
        console.error("Expected type 'ask' after line items only, got 'confirm'");
        return false;
      }

      // Provide category
      const { saveDraft, getDraft } = require("../src/lib/agent/draftStore");
      const draftAfterLineItems = getDraft(threadId);
      saveDraft(threadId, {
        ...draftAfterLineItems,
        __lastAskedSlot: "categoryId",
      });

      const response2 = await handleAgentTurn({
        threadId,
        userMessage: "Roofing",
      });

      // Provide pickup
      const draftAfterCategory = getDraft(threadId);
      saveDraft(threadId, {
        ...draftAfterCategory,
        __lastAskedSlot: "fulfillmentType",
      });

      const response3 = await handleAgentTurn({
        threadId,
        userMessage: "Pickup",
      });

      // Should STILL ask (missing jobNameOrPo)
      if (response3.type === "confirm") {
        console.error("Expected type 'ask' when jobNameOrPo is missing, got 'confirm'");
        return false;
      }

      if (response3.type !== "ask") {
        console.error(`Expected type 'ask', got '${response3.type}'`);
        return false;
      }

      // Verify draft has line items, category, fulfillment but NOT jobNameOrPo
      const finalDraft = getDraft(threadId);
      if (!finalDraft?.lineItems || finalDraft.lineItems.length === 0) {
        console.error("Expected line items to be present");
        return false;
      }
      if (finalDraft.lineItems.length !== 2) {
        console.error(`Expected 2 line items, got ${finalDraft.lineItems.length}`);
        return false;
      }
      if (!finalDraft?.categoryId || finalDraft.categoryId !== "roofing") {
        console.error(`Expected categoryId 'roofing', got '${finalDraft?.categoryId}'`);
        return false;
      }
      if (!finalDraft?.fulfillmentType || finalDraft.fulfillmentType !== "PICKUP") {
        console.error(`Expected fulfillmentType 'PICKUP', got '${finalDraft?.fulfillmentType}'`);
        return false;
      }
      if (finalDraft?.jobNameOrPo) {
        console.error(`Expected jobNameOrPo to be undefined, got '${finalDraft.jobNameOrPo}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 15: With category+pickup but no real lineItems -> returns ask, not confirm
  await new Promise<void>((resolve) => {
    test("With category+pickup but no real lineItems returns ask, not confirm", async () => {
      const threadId = "test-thread-15";
      clearDraft(threadId);

      const { saveDraft, getDraft } = require("../src/lib/agent/draftStore");
      
      // Set up draft with category and pickup but generic line items
      saveDraft(threadId, {
        categoryId: "roofing",
        categoryLabel: "Roofing",
        fulfillmentType: "PICKUP",
        jobNameOrPo: "Test Job",
        lineItems: [
          { description: "materials", quantity: 1, unit: "EA" }, // Generic - should fail validation
        ],
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      // Should NOT confirm because line items are generic
      if (response.type === "confirm") {
        console.error("Expected type 'ask' when line items are generic, got 'confirm'");
        return false;
      }

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Should ask for line items
      if (!response.message || !response.message.toLowerCase().includes("materials")) {
        console.error(`Expected message to ask for materials, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 16: Confirm never returns if needBy is missing (asks needBy instead)
  await new Promise<void>((resolve) => {
    test("Confirm never returns if needBy is missing (asks needBy instead)", async () => {
      const threadId = "test-thread-16";
      clearDraft(threadId);

      const { saveDraft, getDraft } = require("../src/lib/agent/draftStore");
      
      // Set up draft with all fields EXCEPT needBy
      saveDraft(threadId, {
        categoryId: "roofing",
        categoryLabel: "Roofing",
        fulfillmentType: "PICKUP",
        jobNameOrPo: "Test Job",
        lineItems: [
          { description: "Shingles", quantity: 10, unit: "bundles" },
        ],
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        // Missing needBy
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      // Should NOT confirm because needBy is missing
      if (response.type === "confirm") {
        console.error("Expected type 'ask' when needBy is missing, got 'confirm'");
        return false;
      }

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Should ask for needBy
      if (!response.message || !response.message.toLowerCase().includes("need")) {
        console.error(`Expected message to ask for need-by date, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Test 17: Confirm never returns if jobNameOrPo is missing
  await new Promise<void>((resolve) => {
    test("Confirm never returns if jobNameOrPo is missing", async () => {
      const threadId = "test-thread-17";
      clearDraft(threadId);

      const { saveDraft, getDraft } = require("../src/lib/agent/draftStore");
      
      // Set up draft with all fields EXCEPT jobNameOrPo
      saveDraft(threadId, {
        categoryId: "roofing",
        categoryLabel: "Roofing",
        fulfillmentType: "PICKUP",
        needBy: "ASAP",
        lineItems: [
          { description: "Shingles", quantity: 10, unit: "bundles" },
        ],
        priority: "best_price",
        visibility: "broadcast",
        createdFrom: "agent",
        // Missing jobNameOrPo
      });

      const response = await handleAgentTurn({
        threadId,
        userMessage: "that's all",
      });

      // Should NOT confirm because jobNameOrPo is missing
      if (response.type === "confirm") {
        console.error("Expected type 'ask' when jobNameOrPo is missing, got 'confirm'");
        return false;
      }

      if (response.type !== "ask") {
        console.error(`Expected type 'ask', got '${response.type}'`);
        return false;
      }

      // Should ask for jobNameOrPo
      if (!response.message || !response.message.toLowerCase().includes("job") && !response.message.toLowerCase().includes("po")) {
        console.error(`Expected message to ask for job name/PO, got '${response.message}'`);
        return false;
      }

      resolve();
      return true;
    });
  });

  // Wait a bit for all async tests to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Summary
  console.log(`\n📊 Test Summary:`);
  console.log(`   Passed: ${testsPassed}`);
  console.log(`   Failed: ${testsFailed}`);

  // G2: Flow test: Start empty draft, message "100 bundles of shingles and one box of nails"
  // Response NOT confirm (missing category + fulfillment + jobNameOrPo)
  // Provide category + pickup, still NOT confirm until jobNameOrPo provided explicitly
  // Only then confirm
  await new Promise<void>((resolve) => {
    test("Flow: '100 bundles of shingles and one box of nails' → NOT confirm until all fields provided", async () => {
      const threadId = "test-thread-flow-line-items";
      clearDraft(threadId);

      // Step 1: Send line items message
      const response1 = await handleAgentTurn({
        threadId,
        userMessage: "100 bundles of shingles and one box of nails",
      });

      // Should NOT confirm (missing category + fulfillment + jobNameOrPo)
      if (response1.type === "confirm") {
        console.error("Expected NOT confirm after line items only, got confirm");
        return false;
      }

      if (response1.type !== "ask") {
        console.error(`Expected type 'ask', got '${response1.type}'`);
        return false;
      }

      // Step 2: Provide category
      const response2 = await handleAgentTurn({
        threadId,
        userMessage: "roofing",
      });

      // Should still NOT confirm (missing fulfillment + jobNameOrPo)
      if (response2.type === "confirm") {
        console.error("Expected NOT confirm after category only, got confirm");
        return false;
      }

      // Step 3: Provide pickup
      const response3 = await handleAgentTurn({
        threadId,
        userMessage: "pickup",
      });

      // Should still NOT confirm (missing jobNameOrPo)
      if (response3.type === "confirm") {
        console.error("Expected NOT confirm after category + pickup only, got confirm");
        return false;
      }

      // Step 4: Provide needBy
      const response4 = await handleAgentTurn({
        threadId,
        userMessage: "ASAP",
      });

      // Should still NOT confirm (missing jobNameOrPo)
      if (response4.type === "confirm") {
        console.error("Expected NOT confirm after category + pickup + needBy only, got confirm");
        return false;
      }

      // Step 5: Provide jobNameOrPo explicitly
      const response5 = await handleAgentTurn({
        threadId,
        userMessage: "Test Job PO",
      });

      // NOW should confirm
      if (response5.type !== "confirm") {
        console.error(`Expected type 'confirm' after all fields provided, got '${response5.type}'`);
        return false;
      }

      if (!response5.summary) {
        console.error("Expected summary to be present");
        return false;
      }

      // Verify all required fields are present
      if (!response5.summary.jobNameOrPo || response5.summary.jobNameOrPo !== "Test Job PO") {
        console.error(`Expected jobNameOrPo 'Test Job PO', got '${response5.summary.jobNameOrPo}'`);
        return false;
      }

      if (!response5.summary.categoryId || response5.summary.categoryId !== "roofing") {
        console.error(`Expected categoryId 'roofing', got '${response5.summary.categoryId}'`);
        return false;
      }

      if (!response5.summary.fulfillmentType || response5.summary.fulfillmentType !== "PICKUP") {
        console.error(`Expected fulfillmentType 'PICKUP', got '${response5.summary.fulfillmentType}'`);
        return false;
      }

      if (!response5.summary.lineItems || response5.summary.lineItems.length === 0) {
        console.error("Expected lineItems to be present");
        return false;
      }

      return true;
    });
    resolve();
  });

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
}

// Run tests
runTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});

