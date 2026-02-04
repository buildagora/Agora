// src/lib/agent/draftStore.ts
"use client";

/**
 * Session-scoped turn tracking for the Buyer Agent.
 * 
 * INVARIANT: Draft data is stored in thread.draft (agentThreads.ts) which is
 * the canonical, persisted, thread-scoped source of truth.
 * 
 * This module ONLY tracks lastProcessedKey to prevent re-processing agent turns.
 * This is session-scoped (in-memory) because it's about preventing duplicate
 * processing within a single session, not about persistence.
 * 
 * DO NOT use this module for draft storage - use agentThreads.getDraft/applyDraftPatch/clearDraft instead.
 */

/**
 * Development-only invariant checker
 */
function requireThreadId(threadId: string | null | undefined, operation: string): asserts threadId is string {
  if (!threadId || typeof threadId !== "string" || threadId.trim() === "") {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        `[DraftStore] ${operation} requires a valid threadId. Got: ${JSON.stringify(threadId)}`
      );
    }
    console.error(`[DraftStore] ${operation} called without valid threadId`);
  }
}

// Thread-scoped last processed key tracking (session-scoped, in-memory)
const lastProcessedKeys = new Map<string, string | null>();

/** Used to prevent re-processing the same agent turn */
export function getLastProcessedKey(threadId: string): string | null {
  requireThreadId(threadId, "getLastProcessedKey");
  return lastProcessedKeys.get(threadId) || null;
}

export function setLastProcessedKey(threadId: string, key: string | null): void {
  requireThreadId(threadId, "setLastProcessedKey");
  lastProcessedKeys.set(threadId, key);
}

/** Clear the last processed key for a thread */
export function clearLastProcessedKey(threadId: string): void {
  requireThreadId(threadId, "clearLastProcessedKey");
  lastProcessedKeys.delete(threadId);
}

// ============================================================================
// DRAFT FUNCTIONS REMOVED - Use agentThreads.ts instead
// ============================================================================

/**
 * @deprecated DO NOT USE - Drafts are stored in thread.draft (agentThreads.ts)
 * Use agentThreads.getDraft(threadId) instead
 */
export function getDraft(_threadId: string): never {
  throw new Error(
    "[DraftStore] getDraft is removed. Use agentThreads.getDraft(threadId) instead. " +
    "thread.draft is the canonical source of truth."
  );
}

/**
 * @deprecated DO NOT USE - Drafts are stored in thread.draft (agentThreads.ts)
 * Use agentThreads.applyDraftPatch(threadId, patch) instead
 */
export function saveDraft(_threadId: string, _draft: any): never {
  throw new Error(
    "[DraftStore] saveDraft is removed. Use agentThreads.applyDraftPatch(threadId, patch) instead. " +
    "thread.draft is the canonical source of truth."
  );
}

/**
 * @deprecated DO NOT USE - Drafts are stored in thread.draft (agentThreads.ts)
 * Use agentThreads.clearDraft(threadId) instead
 */
export function clearDraft(_threadId: string): never {
  throw new Error(
    "[DraftStore] clearDraft is removed. Use agentThreads.clearDraft(threadId) instead. " +
    "thread.draft is the canonical source of truth."
  );
}

/**
 * @deprecated DO NOT USE - Drafts are stored in thread.draft (agentThreads.ts)
 * Use agentThreads.applyDraftPatch(threadId, patch) instead
 */
export function applyDraftPatch(_threadId: string, _patch: any): never {
  throw new Error(
    "[DraftStore] applyDraftPatch is removed. Use agentThreads.applyDraftPatch(threadId, patch) instead. " +
    "thread.draft is the canonical source of truth."
  );
}

/**
 * @deprecated DO NOT USE - Drafts are stored in thread.draft (agentThreads.ts)
 */
export function setDraft(_draft: any): never {
  throw new Error(
    "[DraftStore] setDraft is removed. Use agentThreads.applyDraftPatch(threadId, patch) instead. " +
    "thread.draft is the canonical source of truth."
  );
}

/**
 * @deprecated DO NOT USE - Drafts are stored in thread.draft (agentThreads.ts)
 */
export function patchDraft(_patch: any): never {
  throw new Error(
    "[DraftStore] patchDraft is removed. Use agentThreads.applyDraftPatch(threadId, patch) instead. " +
    "thread.draft is the canonical source of truth."
  );
}

