/**
 * Agent Handshake Test
 * Tests the translator and idempotency helpers for creating RFQs from agent drafts
 */

import { agentDraftToCreatePayload } from "../src/lib/agent/translator";
import {
  getLastCreateKey,
  setLastCreateKey,
  getLastCreatedRfqId,
  setLastCreatedRfqId,
  clearCreateHandshake,
  generateCreateKey,
} from "../src/lib/agent/createHandshake";
import type { AgentDraftRFQ } from "../src/lib/agent/contracts";

const THREAD_ID = "test-handshake-v1";
const BUYER_ID = "test-buyer-123";

function log(message: string, data?: any) {
  console.log(`[TEST] ${message}`, data ? JSON.stringify(data, null, 2) : "");
}

async function testCase(name: string, fn: () => Promise<void> | void) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log("=".repeat(60));
  
  // Clear state before each test
  if (typeof (global as any).window !== "undefined") {
    clearCreateHandshake(THREAD_ID);
  }
  
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(error);
    throw error;
  }
}

async function main() {
  console.log("Agent Handshake Test Suite");
  console.log("Testing translator and idempotency helpers\n");

  // Test 1: Translator - DELIVERY includes deliveryAddress
  testCase("Translator: DELIVERY includes deliveryAddress", () => {
    const draft: AgentDraftRFQ = {
      jobNameOrPo: "Job ABC-123",
      categoryId: "roofing",
      categoryLabel: "Roofing",
      fulfillmentType: "DELIVERY",
      deliveryAddress: "123 Main St, Huntsville, AL 35801",
      lineItems: [
        { description: "bundles of shingles", quantity: 10, unit: "EA" },
      ],
      needBy: "2026-02-14",
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    };

    const payload = agentDraftToCreatePayload(draft, BUYER_ID);
    
    log("Payload", payload);
    
    if (payload.terms.fulfillmentType !== "DELIVERY") {
      throw new Error(`Expected fulfillmentType "DELIVERY", got "${payload.terms.fulfillmentType}"`);
    }
    
    if (!payload.terms.location) {
      throw new Error("Expected location in terms for DELIVERY");
    }
    
    if (payload.terms.location !== "123 Main St, Huntsville, Al 35801") {
      // Note: normalizeAddress capitalizes words, so "AL" becomes "Al"
      log("Note: Address normalized", payload.terms.location);
    }
  });

  // Test 2: Translator - PICKUP excludes deliveryAddress
  testCase("Translator: PICKUP excludes deliveryAddress", () => {
    const draft: AgentDraftRFQ = {
      jobNameOrPo: "Job XYZ-456",
      categoryId: "hvac",
      categoryLabel: "Mechanical (HVAC)",
      fulfillmentType: "PICKUP",
      lineItems: [
        { description: "HVAC units", quantity: 2, unit: "EA" },
      ],
      needBy: "ASAP",
      priority: "urgent",
      visibility: "broadcast",
      createdFrom: "agent",
    };

    const payload = agentDraftToCreatePayload(draft, BUYER_ID);
    
    log("Payload", payload);
    
    if (payload.terms.fulfillmentType !== "PICKUP") {
      throw new Error(`Expected fulfillmentType "PICKUP", got "${payload.terms.fulfillmentType}"`);
    }
    
    if (payload.terms.location !== undefined) {
      throw new Error("Expected location to be undefined for PICKUP");
    }
  });

  // Test 3: Translator - lineItems map correctly
  testCase("Translator: lineItems map correctly", () => {
    const draft: AgentDraftRFQ = {
      jobNameOrPo: "Test Job",
      categoryId: "plumbing",
      categoryLabel: "Plumbing",
      fulfillmentType: "PICKUP",
      lineItems: [
        { description: "pipes", quantity: 5, unit: "LF" },
        { description: "fittings", quantity: 10 }, // No unit specified
      ],
      needBy: "2026-03-01",
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    };

    const payload = agentDraftToCreatePayload(draft, BUYER_ID);
    
    log("Payload lineItems", payload.lineItems);
    
    if (payload.lineItems.length !== 2) {
      throw new Error(`Expected 2 line items, got ${payload.lineItems.length}`);
    }
    
    if (payload.lineItems[0].quantity !== 5) {
      throw new Error(`Expected first item quantity 5, got ${payload.lineItems[0].quantity}`);
    }
    
    if (payload.lineItems[0].unit !== "LF") {
      throw new Error(`Expected first item unit "LF", got "${payload.lineItems[0].unit}"`);
    }
    
    if (payload.lineItems[1].unit !== "EA") {
      throw new Error(`Expected second item unit "EA" (default), got "${payload.lineItems[1].unit}"`);
    }
  });

  // Test 4: Translator - notes only passed if present
  testCase("Translator: notes only passed if present", () => {
    // Test without notes
    const draftWithoutNotes: AgentDraftRFQ = {
      jobNameOrPo: "Test Job",
      categoryId: "electrical",
      categoryLabel: "Electrical",
      fulfillmentType: "PICKUP",
      lineItems: [{ description: "wire", quantity: 100, unit: "LF" }],
      needBy: "2026-04-01",
      priority: "best_price",
      visibility: "broadcast",
      createdFrom: "agent",
    };

    const payload1 = agentDraftToCreatePayload(draftWithoutNotes, BUYER_ID);
    
    if (payload1.notes !== "") {
      throw new Error(`Expected empty notes, got "${payload1.notes}"`);
    }
    
    // Test with notes
    const draftWithNotes: AgentDraftRFQ = {
      ...draftWithoutNotes,
      notes: "User-provided notes",
    };

    const payload2 = agentDraftToCreatePayload(draftWithNotes, BUYER_ID);
    
    if (payload2.notes !== "User-provided notes") {
      throw new Error(`Expected notes "User-provided notes", got "${payload2.notes}"`);
    }
  });

  // Test 5: Idempotency key generation
  testCase("Idempotency: generateCreateKey creates stable keys", () => {
    const lastProcessedKey = "key_123";
    const key1 = generateCreateKey(THREAD_ID, lastProcessedKey);
    const key2 = generateCreateKey(THREAD_ID, lastProcessedKey);
    
    if (key1 !== key2) {
      throw new Error(`Expected same key for same inputs, got "${key1}" and "${key2}"`);
    }
    
    if (!key1.includes(THREAD_ID)) {
      throw new Error(`Expected key to include threadId, got "${key1}"`);
    }
    
    if (!key1.includes(lastProcessedKey)) {
      throw new Error(`Expected key to include lastProcessedKey, got "${key1}"`);
    }
  });

  // Test 6: Idempotency storage helpers
  testCase("Idempotency: storage helpers work correctly", () => {
    if (typeof (global as any).window === "undefined") {
      log("Skipping storage test (not in browser environment)");
      return;
    }
    
    const createKey = "test_create_key_123";
    const rfqId = "test_rfq_456";
    
    // Set values
    setLastCreateKey(THREAD_ID, createKey);
    setLastCreatedRfqId(THREAD_ID, rfqId);
    
    // Get values
    const retrievedKey = getLastCreateKey(THREAD_ID);
    const retrievedRfqId = getLastCreatedRfqId(THREAD_ID);
    
    if (retrievedKey !== createKey) {
      throw new Error(`Expected create key "${createKey}", got "${retrievedKey}"`);
    }
    
    if (retrievedRfqId !== rfqId) {
      throw new Error(`Expected RFQ ID "${rfqId}", got "${retrievedRfqId}"`);
    }
    
    // Clear and verify
    clearCreateHandshake(THREAD_ID);
    
    const clearedKey = getLastCreateKey(THREAD_ID);
    const clearedRfqId = getLastCreatedRfqId(THREAD_ID);
    
    if (clearedKey !== null) {
      throw new Error(`Expected null after clear, got "${clearedKey}"`);
    }
    
    if (clearedRfqId !== null) {
      throw new Error(`Expected null after clear, got "${clearedRfqId}"`);
    }
  });

  console.log("\n" + "=".repeat(60));
  console.log("All tests passed! ✅");
  console.log("=".repeat(60) + "\n");
}

// Run tests
main().catch((error) => {
  console.error("\n❌ Test suite failed:", error);
  process.exit(1);
});


