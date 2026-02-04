/**
 * Auto-Resolution System
 * Wrapper around the Communication Agent for backward compatibility
 * 
 * @deprecated Use agent.ts directly for new code
 */

import { Message, createSystemMessage } from "./messages";
import { processBuyerMessage } from "./agent";

/**
 * Auto-resolution result
 */
export interface AutoResolutionResult {
  shouldEscalate: boolean; // Whether to create an action item
  autoResponse?: string; // Auto-generated response message
  confidence: number; // Confidence level (0-1)
  reason?: string; // Reason for escalation or auto-resolution
}

/**
 * Auto-resolve a buyer message intent
 * Uses the Communication Agent for decision-making
 * 
 * @deprecated Use processBuyerMessage from agent.ts directly
 */
export function autoResolveBuyerIntent(
  message: Message,
  sellerId: string
): AutoResolutionResult {
  // Use agent for decision-making
  const agentResult = processBuyerMessage(message, sellerId);
  
  // Convert agent decision to auto-resolution result
  switch (agentResult.decision.type) {
    case "AUTO_RESPOND":
      return {
        shouldEscalate: false,
        autoResponse: agentResult.decision.response,
        confidence: agentResult.decision.confidence,
        reason: "Auto-resolved by agent",
      };
    
    case "UPDATE_FIELDS":
      // For now, treat field updates as escalation (human needs to approve)
      return {
        shouldEscalate: true,
        confidence: agentResult.decision.confidence,
        reason: `Field updates required: ${agentResult.decision.updates.map(u => u.field).join(", ")}`,
      };
    
    case "ESCALATE":
      return {
        shouldEscalate: true,
        confidence: agentResult.decision.confidence,
        reason: agentResult.decision.reason,
      };
  }
}

/**
 * Create auto-response message and mark original as resolved
 */
export function createAutoResponse(
  threadId: string,
  originalMessage: Message,
  autoResponse: string
): void {
  createSystemMessage(
    threadId,
    autoResponse,
    {
      eventType: "AUTO_RESPONSE",
      originalMessageId: originalMessage.id,
      intent: originalMessage.metadata?.intent,
      isAutoResolved: true,
    }
  );
}
