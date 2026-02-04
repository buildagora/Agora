/**
 * UI-Safe Chat Message Types
 * Types for rendering chat messages in the agent UI
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
}

/**
 * Agent UI mode for controlling state transitions
 */
export type AgentMode = "DRAFTING" | "CONFIRMING" | "CREATING" | "CREATED";

/**
 * Generate a unique message ID
 * Uses timestamp + counter for uniqueness (not cryptographically secure, but sufficient for UI)
 */
let messageCounter = 0;

export function createMessageId(): string {
  const timestamp = Date.now();
  const counter = messageCounter++;
  return `msg_${timestamp}_${counter}`;
}

/**
 * Create a chat message
 */
export function createChatMessage(
  role: ChatRole,
  text: string,
  id?: string
): ChatMessage {
  return {
    id: id || createMessageId(),
    role,
    text,
    ts: Date.now(),
  };
}

