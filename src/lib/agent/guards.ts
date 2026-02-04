/**
 * ⚠️ FROZEN FOUNDATION — Do not modify without explicit approval
 * 
 * This file implements client-side guards for agent operations.
 * It is a stable platform layer that future features build on top of, not inside.
 * 
 * FROZEN INVARIANTS:
 * - assertThreadId() validates threadId is non-empty string
 * - guardReadyState() checks threadId, authReady, isSending before operations
 * - All guards fail closed (return error, do not proceed)
 * 
 * Changes to this file require:
 * 1. Design review for any behavior changes
 * 2. Test updates for any logic changes
 * 3. Documentation updates for any API changes
 */

/**
 * Agent Client Guards
 * Centralized guards for agent operations to enforce invariants
 */

/**
 * Assert that a threadId is valid (non-empty string)
 * @throws Error if threadId is invalid
 */
export function assertThreadId(threadId: string | null | undefined): asserts threadId is string {
  if (!threadId || typeof threadId !== "string" || threadId.trim().length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AGENT_GUARD] Invalid threadId:", { threadId, type: typeof threadId });
    }
    throw new Error("Thread ID is required");
  }
}

/**
 * Guard ready state for agent operations
 * Returns true if operation can proceed, false otherwise
 */
export interface ReadyState {
  threadId: string | null;
  authReady: boolean;
  isSending?: boolean;
}

export function guardReadyState(
  state: ReadyState,
  operation: string
): { canProceed: boolean; reason?: string } {
  // Check threadId
  if (!state.threadId) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[AGENT_GUARD] ${operation} blocked: no threadId`);
    }
    return { canProceed: false, reason: "No active thread" };
  }

  // Check auth
  if (!state.authReady) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[AGENT_GUARD] ${operation} blocked: auth not ready`);
    }
    return { canProceed: false, reason: "Authentication not ready" };
  }

  // Check if already sending (for message operations)
  if (state.isSending && operation === "sendMessage") {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[AGENT_GUARD] ${operation} blocked: already sending`);
    }
    return { canProceed: false, reason: "Message already sending" };
  }

  return { canProceed: true };
}
