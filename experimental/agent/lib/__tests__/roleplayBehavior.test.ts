/**
 * Regression tests for roleplay behavior
 * Verifies answer-first routing, direct-order confirmation, and follow-up handling
 */

import { computeProcurementStatus } from "../procurementStatus";
import { handleSlotFollowUp } from "../followUp";
import { detectTurnIntent } from "../turnIntent";
import { getDefaultThreadState } from "@/lib/threadState";

describe("Roleplay Behavior", () => {
  const defaultThreadState = getDefaultThreadState();

  describe("Required Slots Only", () => {
    test("Only required fields block dispatch (categoryId, lineItems, needBy, fulfillmentType, visibility)", () => {
      const draft = {
        categoryId: "roofing",
        lineItems: [{ description: "shingles", quantity: 100, unit: "BUNDLE" }],
        needBy: "2024-01-15",
        fulfillmentType: "PICKUP",
        visibility: "broadcast",
        // jobNameOrPo is NOT required
      };
      
      const status = computeProcurementStatus({ draft });
      expect(status.isReadyToConfirm).toBe(true);
      expect(status.missingRequired).not.toContain("jobNameOrPo");
    });

    test("deliveryAddress required only when fulfillmentType=DELIVERY", () => {
      const draftPickup = {
        categoryId: "roofing",
        lineItems: [{ description: "shingles", quantity: 100, unit: "BUNDLE" }],
        needBy: "2024-01-15",
        fulfillmentType: "PICKUP",
        visibility: "broadcast",
        // No deliveryAddress - should be ready
      };
      
      const statusPickup = computeProcurementStatus({ draft: draftPickup });
      expect(statusPickup.isReadyToConfirm).toBe(true);
      expect(statusPickup.missingRequired).not.toContain("deliveryAddress");
      
      const draftDelivery = {
        categoryId: "roofing",
        lineItems: [{ description: "shingles", quantity: 100, unit: "BUNDLE" }],
        needBy: "2024-01-15",
        fulfillmentType: "DELIVERY",
        visibility: "broadcast",
        // No deliveryAddress - should NOT be ready
      };
      
      const statusDelivery = computeProcurementStatus({ draft: draftDelivery });
      expect(statusDelivery.isReadyToConfirm).toBe(false);
      expect(statusDelivery.missingRequired).toContain("deliveryAddress");
    });
  });

  describe("Answer-First Routing", () => {
    test("'How thick is Hardie siding?' should be ASK_INFO and not start procurement", () => {
      const intent = detectTurnIntent({
        message: "How thick is Hardie siding?",
        draft: {},
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("ASK_INFO");
    });

    test("Factual question without order intent should not trigger procurement", () => {
      const intent = detectTurnIntent({
        message: "How many pieces for 100 squares?",
        draft: {},
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("ASK_INFO");
    });
  });

  describe("Direct-Order Confirmation", () => {
    test("After extraction with lineItems + categoryId, next question should be neededBy or fulfillmentType or visibility ONLY", () => {
      const draft = {
        categoryId: "roofing",
        lineItems: [{ description: "Oakridge Onyx Black Shingles", quantity: 100, unit: "BUNDLE" }],
        // Missing: needBy, fulfillmentType, visibility
      };
      
      const status = computeProcurementStatus({ draft });
      expect(status.isReadyToConfirm).toBe(false);
      expect(status.nextQuestionId).toBe("needBy"); // First missing in priority
      expect(status.missingRequired).not.toContain("jobNameOrPo");
    });
  });

  describe("Follow-Up Handler", () => {
    test("'pickup tomorrow' resolves fulfillmentType + needBy", () => {
      const result = handleSlotFollowUp("fulfillmentType", "pickup tomorrow");
      expect(result.handled).toBe(true);
      expect(result.draftPatch?.fulfillmentType).toBe("PICKUP");
      // CRITICAL: Prefer canonical needBy (neededBy is alias for backward compat)
      expect(result.draftPatch?.needBy).toBeDefined();
      expect(typeof result.draftPatch?.needBy).toBe("string");
      expect((result.draftPatch?.needBy as string).match(/^\d{4}-\d{2}-\d{2}$/)).toBeTruthy();
    });

    test("'All eligible suppliers' resolves visibility and proceeds", () => {
      const result = handleSlotFollowUp("visibility", "All eligible suppliers");
      expect(result.handled).toBe(true);
      expect(result.draftPatch?.visibility).toBe("broadcast");
      
      // After follow-up, draft should be ready if other fields are present
      const draft = {
        categoryId: "roofing",
        lineItems: [{ description: "shingles", quantity: 100, unit: "BUNDLE" }],
        needBy: "2024-01-15",
        fulfillmentType: "PICKUP",
        visibility: result.draftPatch?.visibility,
      };
      
      const status = computeProcurementStatus({ draft });
      expect(status.isReadyToConfirm).toBe(true);
    });
  });

  describe("Just Do It / Just Order", () => {
    test("'just do it' should be CONFIRM intent when ready", () => {
      const draft = {
        categoryId: "roofing",
        lineItems: [{ description: "shingles", quantity: 100, unit: "BUNDLE" }],
        needBy: "2024-01-15",
        fulfillmentType: "PICKUP",
        visibility: "broadcast",
      };
      
      const intent = detectTurnIntent({
        message: "just do it",
        draft,
        threadState: defaultThreadState,
        conversationMode: "procurement",
      });
      expect(intent).toBe("CONFIRM");
    });

    test("'just create an order for that' should be CONFIRM intent when ready", () => {
      const draft = {
        categoryId: "roofing",
        lineItems: [{ description: "shingles", quantity: 100, unit: "BUNDLE" }],
        needBy: "2024-01-15",
        fulfillmentType: "PICKUP",
        visibility: "broadcast",
      };
      
      const intent = detectTurnIntent({
        message: "just create an order for that",
        draft,
        threadState: defaultThreadState,
        conversationMode: "procurement",
      });
      expect(intent).toBe("CONFIRM");
    });
  });
});

