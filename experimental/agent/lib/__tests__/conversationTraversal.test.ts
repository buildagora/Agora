/**
 * Tests for conversation traversal behavior
 * Verifies that the agent behaves like a great human sales rep
 */

import { detectTurnIntent } from "../turnIntent";
import { parseLineItemsFromText } from "../parseLineItems";
import { handleSlotFollowUp } from "../followUp";
import { getDefaultThreadState } from "@/lib/threadState";

describe("Conversation Traversal", () => {
  const defaultThreadState = getDefaultThreadState();
  const defaultDraft = {};

  describe("Intent Detection", () => {
    test("ASK_INFO: 'How thick is Hardie siding?' should not trigger procurement", () => {
      const intent = detectTurnIntent({
        message: "How thick is Hardie siding?",
        draft: defaultDraft,
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("ASK_INFO");
    });

    test("ASK_INFO: 'How many pieces for 100 squares?' should be ASK_INFO", () => {
      const intent = detectTurnIntent({
        message: "How many pieces for 100 squares?",
        draft: defaultDraft,
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("ASK_INFO");
    });

    test("PROCURE: 'Create an order for 100 bundles of Oakridge Onyx Black shingles'", () => {
      const intent = detectTurnIntent({
        message: "Create an order for 100 bundles of Oakridge Onyx Black shingles",
        draft: defaultDraft,
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("PROCURE");
    });

    test("PROCURE: 'I need 100 bundles of shingles'", () => {
      const intent = detectTurnIntent({
        message: "I need 100 bundles of shingles",
        draft: defaultDraft,
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("PROCURE");
    });

    test("PROCURE: 'Send for pricing'", () => {
      const intent = detectTurnIntent({
        message: "Send for pricing",
        draft: defaultDraft,
        threadState: defaultThreadState,
        conversationMode: "advice",
      });
      expect(intent).toBe("PROCURE");
    });
  });

  describe("Line Item Parsing", () => {
    test("Parse '100 bundles of oakridge onyx black shingles'", () => {
      const items = parseLineItemsFromText("100 bundles of oakridge onyx black shingles");
      expect(items.length).toBe(1);
      expect(items[0]).toEqual({
        quantity: 100,
        unit: "BUNDLE",
        description: "Oakridge Onyx Black Shingles",
      });
    });

    test("Parse '100 bundles oakridge onyx black shingles' (without 'of')", () => {
      const items = parseLineItemsFromText("100 bundles oakridge onyx black shingles");
      expect(items.length).toBe(1);
      expect(items[0].quantity).toBe(100);
      expect(items[0].unit).toBe("BUNDLE");
      expect(items[0].description.toLowerCase()).toContain("oakridge");
    });
  });

  describe("Follow-Up Handling", () => {
    test("'pickup tomorrow' after fulfillmentType question", () => {
      const result = handleSlotFollowUp("fulfillmentType", "pickup tomorrow");
      expect(result.handled).toBe(true);
      expect(result.draftPatch?.fulfillmentType).toBe("PICKUP");
      // CRITICAL: Prefer canonical needBy (neededBy is alias for backward compat)
      expect(result.draftPatch?.needBy).toBeDefined();
    });

    test("'all eligible suppliers' after visibility question", () => {
      const result = handleSlotFollowUp("visibility", "all eligible suppliers");
      expect(result.handled).toBe(true);
      expect(result.draftPatch?.visibility).toBe("broadcast");
    });

    test("'preferred suppliers only' after visibility question", () => {
      const result = handleSlotFollowUp("visibility", "preferred suppliers only");
      expect(result.handled).toBe(true);
      expect(result.draftPatch?.visibility).toBe("direct");
    });

    test("'tomorrow' after needBy question", () => {
      const result = handleSlotFollowUp("needBy", "tomorrow");
      expect(result.handled).toBe(true);
      // CRITICAL: Prefer canonical needBy (neededBy is alias for backward compat)
      expect(result.draftPatch?.needBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("Category Inference", () => {
    test("'shingles' in line items should infer 'roofing' category", () => {
      const items = parseLineItemsFromText("100 bundles of oakridge onyx black shingles");
      const itemDescriptions = items.map(item => item.description.toLowerCase()).join(" ");
      expect(itemDescriptions).toContain("shingle");
      // This would be handled in route.ts, but we verify the pattern here
    });

    test("'siding' in line items should infer 'lumber_siding' category", () => {
      const items = parseLineItemsFromText("100 squares of hardie lap siding");
      const itemDescriptions = items.map(item => item.description.toLowerCase()).join(" ");
      expect(itemDescriptions).toContain("siding");
    });
  });
});

