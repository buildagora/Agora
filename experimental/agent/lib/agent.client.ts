/**
 * Communication Agent - Client-Safe
 * Client-side utilities and types for the Communication Agent
 * 
 * This module contains ONLY client-safe code (types, utilities, fetch wrappers).
 * It does NOT import server-only modules.
 */

// Re-export types from server module (types are safe to share)
export type {
  AgentDecision,
  StructuredFieldUpdate,
  AgentContext,
  AgentDecisionResult,
} from "./agent.server";


