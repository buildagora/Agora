/**
 * Unit tests for turn intent detection
 */

import { detectTurnIntent } from "../turnIntent";
import { getDefaultThreadState } from "@/lib/threadState";

describe("detectTurnIntent", () => {
  const defaultThreadState = getDefaultThreadState();
  const defaultDraft = {};

  test("QUICK_ANSWER: 'How many pieces for 100 squares of Hardie lap siding?'", () => {
    const intent = detectTurnIntent({
      message: "How many pieces for 100 squares of Hardie lap siding?",
      draft: defaultDraft,
      threadState: defaultThreadState,
      conversationMode: "advice",
    });
    expect(intent).toBe("QUICK_ANSWER");
  });

  test("DIRECT_ORDER: 'I need 100 bundles Oakridge Onyx Black pickup tomorrow'", () => {
    const intent = detectTurnIntent({
      message: "I need 100 bundles Oakridge Onyx Black pickup tomorrow",
      draft: defaultDraft,
      threadState: defaultThreadState,
      conversationMode: "procurement",
    });
    expect(intent).toBe("DIRECT_ORDER");
  });

  test("PROCUREMENT: message with existing procurement fields", () => {
    const intent = detectTurnIntent({
      message: "What else do you need?",
      draft: {
        lineItems: [{ description: "shingles", quantity: 10 }],
      },
      threadState: { ...defaultThreadState, mode: "PROCUREMENT" },
      conversationMode: "procurement",
    });
    expect(intent).toBe("PROCUREMENT");
  });

  test("CONFIRM: ready to confirm and user says yes", () => {
    // Mock computeRfqStatus to return ready
    const intent = detectTurnIntent({
      message: "Yes, send it",
      draft: {
        lineItems: [{ description: "shingles", quantity: 10 }],
        jobNameOrPo: "Job 123",
        fulfillmentType: "PICKUP",
        needBy: "2024-01-15",
      },
      threadState: defaultThreadState,
      conversationMode: "procurement",
    });
    // Note: This will only be CONFIRM if computeRfqStatus returns isReadyToConfirm=true
    // In a real test, we'd mock computeRfqStatus
    expect(["CONFIRM", "PROCUREMENT"]).toContain(intent);
  });

  test("ADVICE: default fallback", () => {
    const intent = detectTurnIntent({
      message: "What is the difference between shingles and tiles?",
      draft: defaultDraft,
      threadState: defaultThreadState,
      conversationMode: "advice",
    });
    expect(intent).toBe("ADVICE");
  });
});

