/**
 * Thread State - Single Source of Truth for Agent Thread State Machine
 * 
 * This module defines the authoritative persisted ThreadState separate from ThreadDraft.
 * State machine fields (mode, phase, progress, dispatch) are stored here, not in draft.
 * 
 * Server-safe module (no "use client")
 */

export type Mode = "ADVICE" | "PROCUREMENT";

export type Phase = "INTAKE" | "CONFIRM" | "DISPATCHING" | "DISPATCHED" | "ERROR" | null;

export type DispatchStatus = "IDLE" | "CONFIRMED" | "DISPATCHING" | "DISPATCHED" | "ERROR";

export interface ThreadState {
  mode: Mode;
  phase: Phase;
  progress: {
    lastQuestionId?: string | null; // Current question being asked (FieldId) - NOT used for question selection
    lastQuestionAttempts?: number; // Number of times we've asked the current question - NOT used for question selection
    lastUserMessageId?: string; // Maps from __lastUserMessageId (idempotency only)
    lastUserMessageHash?: string; // Maps from __lastUserMessageHash (idempotency only)
  };
  dispatch: {
    status?: DispatchStatus;
    confirmedAt?: string; // ISO timestamp
    dispatchedAt?: string; // ISO timestamp
    requestId?: string; // Maps from __requestId
    sendTo?: string; // Maps from pricingSendTo (email only)
    error?: string;
  };
}

/**
 * Get default thread state
 */
export function getDefaultThreadState(): ThreadState {
  return {
    mode: "ADVICE",
    phase: null,
    progress: {
      lastQuestionId: null,
      lastQuestionAttempts: 0,
    },
    dispatch: {
      status: "IDLE",
    },
  };
}

/**
 * Parse thread state from JSON string
 */
export function parseThreadState(raw: string | null): ThreadState {
  if (!raw) {
    return getDefaultThreadState();
  }
  
  try {
    const parsed = JSON.parse(raw);
    // Merge with defaults to ensure all fields exist
    return {
      mode: parsed.mode || "ADVICE",
      phase: parsed.phase ?? null,
      progress: {
        lastQuestionId: parsed.progress?.lastQuestionId ?? null,
        lastQuestionAttempts: parsed.progress?.lastQuestionAttempts ?? 0,
        lastUserMessageId: parsed.progress?.lastUserMessageId,
        lastUserMessageHash: parsed.progress?.lastUserMessageHash,
      },
      dispatch: {
        status: parsed.dispatch?.status || "IDLE",
        confirmedAt: parsed.dispatch?.confirmedAt,
        dispatchedAt: parsed.dispatch?.dispatchedAt,
        requestId: parsed.dispatch?.requestId,
        sendTo: parsed.dispatch?.sendTo,
        error: parsed.dispatch?.error,
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[STATE_PARSE] Failed to parse thread state", {
        raw: raw.substring(0, 200),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return getDefaultThreadState();
  }
}

/**
 * Serialize thread state to JSON string
 */
export function serializeThreadState(state: ThreadState): string {
  return JSON.stringify(state);
}

/**
 * Split draft and state - migrates legacy keys from draft to state
 * 
 * This function extracts state machine fields from draft and returns:
 * - draft: cleaned draft without state keys
 * - statePatch: partial state to merge into existing state
 * 
 * Legacy keys migrated (for backward compatibility only):
 * - __lastUserMessageId -> state.progress.lastUserMessageId (idempotency only)
 * - __lastUserMessageHash -> state.progress.lastUserMessageHash (idempotency only)
 * 
 * PERMANENTLY BANNED (rejected at API level with 400):
 * - conversationMode, __lastAskedSlot, __resolvedSlots, __lastQuestionAsked, expectedField
 * - __pricingConfirmed, __pricingConfirmedAt, __pricingDispatched, __pricingDispatchedAt, __requestId, pricingSendTo
 *   (Dispatch state is server-controlled only - only /api/agent/turn can modify state.dispatch)
 * These keys are deleted defensively but should never reach this function.
 */
export function splitDraftAndState(draft: any): {
  cleanDraft: any;
  statePatch: Partial<ThreadState> | null;
} {
  if (!draft || typeof draft !== "object") {
    return {
      cleanDraft: draft || {},
      statePatch: null,
    };
  }
  
  const cleanedDraft: any = { ...draft };
  const statePatch: Partial<ThreadState> = {};
  let hasStatePatch = false;
  
  // REMOVED: Migration of conversationMode - this key is permanently banned
  // Defensive cleanup only (should never reach here - rejected at API level)
  if (cleanedDraft.conversationMode !== undefined) {
    delete cleanedDraft.conversationMode;
  }
  
  // REMOVED: Migration of __lastAskedSlot, __resolvedSlots, __lastQuestionAsked, expectedField
  // These keys are permanently banned - delete them but do NOT migrate to state
  // They should never reach this function (rejected at API level), but defensive deletion
  if (cleanedDraft.__lastQuestionAsked !== undefined || cleanedDraft.__lastAskedSlot !== undefined) {
    delete cleanedDraft.__lastQuestionAsked;
    delete cleanedDraft.__lastAskedSlot;
  }
  
  if (cleanedDraft.__resolvedSlots !== undefined) {
    delete cleanedDraft.__resolvedSlots;
  }
  
  if (cleanedDraft.expectedField !== undefined) {
    delete cleanedDraft.expectedField;
  }
  
  // Migrate __lastUserMessageHash -> state.progress.lastUserMessageHash (idempotency only)
  if (cleanedDraft.__lastUserMessageHash !== undefined) {
    if (!statePatch.progress) statePatch.progress = {};
    statePatch.progress.lastUserMessageHash = cleanedDraft.__lastUserMessageHash;
    hasStatePatch = true;
    delete cleanedDraft.__lastUserMessageHash;
  }
  
  // Migrate __lastUserMessageId -> state.progress.lastUserMessageId
  if (cleanedDraft.__lastUserMessageId !== undefined) {
    if (!statePatch.progress) statePatch.progress = {};
    statePatch.progress.lastUserMessageId = cleanedDraft.__lastUserMessageId;
    hasStatePatch = true;
    delete cleanedDraft.__lastUserMessageId;
  }
  
  // REMOVED: Migration of dispatch keys - dispatch state is server-controlled only
  // Clients cannot patch dispatch state - only /api/agent/turn can modify state.dispatch
  // Defensive cleanup only (should never reach here - rejected at API level)
  if (cleanedDraft.__pricingConfirmed !== undefined) {
    delete cleanedDraft.__pricingConfirmed;
    delete cleanedDraft.__pricingConfirmedAt;
  }
  
  if (cleanedDraft.__pricingDispatched !== undefined) {
    delete cleanedDraft.__pricingDispatched;
    delete cleanedDraft.__pricingDispatchedAt;
  }
  
  if (cleanedDraft.__requestId !== undefined) {
    delete cleanedDraft.__requestId;
  }
  
  if (cleanedDraft.pricingSendTo !== undefined) {
    delete cleanedDraft.pricingSendTo;
  }
  
  // Remove all other __* keys (defensive cleanup)
  // Note: This should never execute for forbidden keys (rejected at API level), but defensive deletion
  for (const key in cleanedDraft) {
    if (key.startsWith("__")) {
      // Only allow documented idempotency keys
      if (key !== "__lastUserMessageId" && key !== "__lastUserMessageHash") {
        delete cleanedDraft[key];
      }
    }
  }
  
  if (hasStatePatch) {
    const movedKeys: string[] = [];
    // conversationMode migration removed - permanently banned
    // Dispatch state migration removed - server-controlled only
    if (statePatch.progress?.lastUserMessageId) movedKeys.push("__lastUserMessageId");
    if (statePatch.progress?.lastUserMessageHash) movedKeys.push("__lastUserMessageHash");
    
    if (process.env.NODE_ENV === "development") {
      console.log("[STATE_MIGRATE]", {
        threadId: "unknown", // Will be set by caller if available
        movedKeys,
        statePatch,
        remainingDraftKeys: Object.keys(cleanedDraft),
      });
    }
  }
  
  return {
    cleanDraft: cleanedDraft,
    statePatch: hasStatePatch ? statePatch : null,
  };
}

/**
 * Strip legacy dispatch keys from an object (defensive cleanup)
 * These keys should never be in draft - they belong in ThreadState.dispatch
 */
export function stripLegacyDispatchKeys(obj: any): void {
  if (!obj || typeof obj !== "object") {
    return;
  }
  delete obj.pricingSendTo;
  delete obj.__pricingConfirmed;
  delete obj.__pricingConfirmedAt;
  delete obj.__pricingDispatched;
  delete obj.__pricingDispatchedAt;
  delete obj.__requestId;
}

