/**
 * Agent Orchestrator V1 (Conversation Loop)
 * Coordinates intent routing and slot filling to handle agent turns
 */

import { routeIntent } from "./intentRouter";
import { applyRouterDecision } from "./slotFiller";
import { getDraft, applyDraftPatch } from "../agentThreads";
import type { AgentDraftRFQ } from "./contracts";
import { validateAgentDraftRFQ } from "./contracts";
import { AGENT_CAPABILITY_INVENTORY } from "./capabilities";

/**
 * Agent response types
 */
export type AgentResponse =
  | { type: "ask"; message: string }
  | { type: "confirm"; summary: AgentDraftRFQ }
  | { type: "advise"; message: string }
  | { type: "noop" };

/**
 * Handle a single agent turn (user message → agent response)
 * 
 * Pipeline:
 * 1. Load existing draft
 * 2. Route intent from user message
 * 3. Apply router decision to update draft
 * 4. Return appropriate response based on state
 */
export async function handleAgentTurn(args: {
  threadId: string;
  userMessage: string;
}): Promise<AgentResponse> {
  const { threadId, userMessage } = args;

  // Step 1: Load existing draft
  const currentDraft = await getDraft(threadId);

  // Step 2: Route intent from user message
  const decision = routeIntent({
    threadId,
    userMessage,
    currentDraft: currentDraft || undefined,
  });

  // Step 3: Apply router decision to update draft state
  const slotFillResult = await applyRouterDecision({
    threadId,
    decision,
  });

  // If duplicate, return noop
  if (slotFillResult.skippedAsDuplicate) {
    return { type: "noop" };
  }

  // Step 4: Reload updated draft
  const updatedDraft = await getDraft(threadId);

  // Step 5: Determine response based on decision mode and state
  if (decision.mode === "ADVICE") {
    // Advice mode: provide guidance based on user message
    const lowerMessage = userMessage.toLowerCase();
    
    // Handle common questions
    if (lowerMessage.includes("what can you help") || lowerMessage.includes("what can you do") || lowerMessage.includes("capabilities")) {
      // Provide a concise capability list
      const capabilities = AGENT_CAPABILITY_INVENTORY.slice(0, 6).map(cap => cap.name);
      return {
        type: "advise",
        message: `I can help you with:\n${capabilities.map(cap => `• ${cap}`).join("\n")}\n\nWhat would you like to do?`,
      };
    }
    
    if (lowerMessage.includes("preferred supplier") || lowerMessage.includes("who are my preferred")) {
      return {
        type: "advise",
        message: "You can view and edit your preferred suppliers in the Preferred Suppliers settings. Want me to start a request using them? What category is this for?",
      };
    }
    
    if (lowerMessage.includes("supplier") && (lowerMessage.includes("near") || lowerMessage.includes("nearby") || lowerMessage.includes("local"))) {
      return {
        type: "advise",
        message: "You can find suppliers in your area using the Supplier Discovery tab. For now, I can help you create a request. What materials do you need?",
      };
    }
    
    // Generic advice response
    return {
      type: "advise",
      message: "I'm here to help you think through the job and make sure nothing's missed. What are you working on?",
    };
  }

  // CRITICAL: Enforce confirm gating - validate draft before confirming
  // Even if slotFillResult.readyToDispatch is true, we must validate
  if (slotFillResult.readyToDispatch) {
    // Ready to dispatch: return confirmation with full draft
    // CRITICAL: Validate draft before confirming
    if (!updatedDraft) {
      // This shouldn't happen, but handle gracefully
      return {
        type: "ask",
        message: slotFillResult.nextQuestion || "I need a bit more information to proceed.",
      };
    }

    // HARD GUARD: Validate the draft using the contract validator
    const validation = validateAgentDraftRFQ(updatedDraft);
    
    // ONLY return confirm if validation passes
    if (!validation.ok) {
      // NEVER say ready. NEVER emit create CTA.
      const missingFields = validation.missing || [];
      const slot = missingFields[0] as "jobNameOrPo" | "lineItems" | "neededBy" | undefined;
      
      // Deterministic prompts by field (matches validation order)
      const questionForSlot: Record<string, string> = {
        jobNameOrPo: "What's the Job Name or PO # for this request?",
        lineItems: "Please tell me the quantity + item (example: 10 bundles of shingles).",
        neededBy: "When do you need it? (ASAP / Today / Tomorrow / Pick a date)",
      };
      
      const question = slot ? (questionForSlot[slot] || "Please provide the missing required information.") : (slotFillResult.nextQuestion || "I need a bit more information to proceed.");
      
      // Make missing-field question deterministic: lock slot until satisfied
      // If we already asked this exact slot last turn, keep asking the same question
      if (slot && slot === updatedDraft.__lastAskedSlot) {
        // Don't switch slots - keep asking the same question
        await applyDraftPatch(threadId, {
          __lastAskedSlot: slot,
          expectedField: slot as any,
        });
        
        return {
          type: "ask",
          message: question,
        };
      }
      
      // Set expectedField in draft update
      if (slot) {
        await applyDraftPatch(threadId, {
          __lastAskedSlot: slot,
          expectedField: slot as any,
        });
      }
      
      // ALWAYS return ask when validation fails
      return {
        type: "ask",
        message: question,
      };
    }

    // Only here may you say ready
    // Create a complete AgentDraftRFQ for confirmation
    // The draft is validated, so all required fields exist
    const summary: AgentDraftRFQ = {
      jobNameOrPo: updatedDraft.jobNameOrPo!,
      categoryId: updatedDraft.categoryId!,
      categoryLabel: updatedDraft.categoryLabel,
      fulfillmentType: updatedDraft.fulfillmentType!,
      deliveryAddress: updatedDraft.deliveryAddress,
      lineItems: updatedDraft.lineItems!,
      needBy: updatedDraft.needBy,
      notes: updatedDraft.notes, // Preserve existing notes (never auto-populate)
      priority: updatedDraft.priority || "best_price",
      visibility: updatedDraft.visibility || "broadcast",
      targetSupplierIds: updatedDraft.targetSupplierIds,
      createdFrom: "agent",
    };

    // Clear expectedField and __lastAskedSlot when ready
    await applyDraftPatch(threadId, {
      expectedField: null as any,
      __lastAskedSlot: undefined,
    });

    return {
      type: "confirm",
      summary,
    };
  }

  // Not ready: ask next question
  if (slotFillResult.nextQuestion) {
    // Combine acknowledgment (if any) with next question
    const acknowledgment = decision.acknowledgment;
    const message = acknowledgment 
      ? `${acknowledgment} ${slotFillResult.nextQuestion}`
      : slotFillResult.nextQuestion;
    
    return {
      type: "ask",
      message,
    };
  }

  // Fallback: ask a generic question
  return {
    type: "ask",
    message: "What else do you need?",
  };
}

