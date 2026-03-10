/**
 * Auto-Resolution System - Server-Only
 * Wrapper around the Communication Agent for backward compatibility
 * 
 * @deprecated Use agent.server.ts directly for new code
 */

import "server-only";

import { Message } from "./messages";
import { processBuyerMessage } from "./agent.server";

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
 * @deprecated Use processBuyerMessage from agent.server.ts directly
 */
export async function autoResolveBuyerIntent(
  message: Message,
  sellerId: string
): Promise<AutoResolutionResult> {
  try {
    // Use agent for decision-making
    const agentResult = await processBuyerMessage(message, sellerId);
    
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
      
      default:
        // Safe fallback for unknown decision types
        return {
          shouldEscalate: true,
          confidence: 0.5,
          reason: "Unknown decision type from agent",
        };
    }
  } catch (error) {
    // Safe fallback on error
    return {
      shouldEscalate: true,
      confidence: 0.0,
      reason: error instanceof Error ? error.message : "Failed to process buyer message",
    };
  }
}

/**
 * Auto-resolve a buyer message
 */
export async function autoResolveBuyerMessage(
  message: Message,
  sellerId: string
): Promise<AutoResolutionResult> {
  try {
    const agentResult = await processBuyerMessage(message, sellerId);
    // Convert AgentDecisionResult to AutoResolutionResult
    // This is a type assertion since the shapes may not match exactly
    return {
      shouldEscalate: agentResult.decision.type === "ESCALATE" || agentResult.decision.type === "UPDATE_FIELDS",
      autoResponse: agentResult.decision.type === "AUTO_RESPOND" ? agentResult.decision.response : undefined,
      confidence: agentResult.decision.confidence,
      reason: agentResult.decision.type === "ESCALATE" ? agentResult.decision.reason : "Processed by agent",
    };
  } catch (error) {
    // Safe fallback on error
    return {
      shouldEscalate: true,
      confidence: 0.0,
      reason: error instanceof Error ? error.message : "Failed to process buyer message",
    };
  }
}


