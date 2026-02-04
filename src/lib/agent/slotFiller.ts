/**
 * Slot-Filling Engine V1
 * Applies router decisions to draft state with idempotency
 */

import type { RouterDecision } from "./intentRouter";
import type { AgentDraftRFQ, AgentLineItem } from "./contracts";
import { getDraft, applyDraftPatch } from "../agentThreads";
import {
  getLastProcessedKey,
  setLastProcessedKey,
} from "./draftStore";

/**
 * Result of applying a router decision
 */
export interface SlotFillResult {
  draft: Partial<AgentDraftRFQ>;
  skippedAsDuplicate: boolean;
  nextQuestion?: string;
  readyToDispatch: boolean;
}

/**
 * Apply router decision to draft state
 * Handles idempotency, merging, and special slot rules
 */
export async function applyRouterDecision(args: {
  threadId: string;
  decision: RouterDecision;
}): Promise<SlotFillResult> {
  const { threadId, decision } = args;

  // Validate decision
  if (!decision || !decision.idempotencyKey) {
    throw new Error("Invalid decision: missing idempotencyKey");
  }

  // Check idempotency: if this key was already processed, skip
  const lastKey = getLastProcessedKey(threadId);
  if (lastKey === decision.idempotencyKey) {
    const existingDraft = await getDraft(threadId);
    return {
      draft: existingDraft || {},
      skippedAsDuplicate: true,
      nextQuestion: decision.nextQuestion,
      readyToDispatch: decision.readyToDispatch,
    };
  }

  // Load existing draft (or start with empty)
  const existingDraft = (await getDraft(threadId)) || {};

  // E: Prevent draftPatch from overwriting unrelated fields
  // A3: Client-side draft updates MUST respect expectedField
  function mergeDraftSafe(prev: any, patch: any): any {
    const merged = { ...prev };
    const expected = prev.expectedField;
    
    // E: NEVER allow these to be set by agent except via explicit expectedField flow
    if ("jobNameOrPo" in patch && expected !== "jobNameOrPo") {
      delete patch.jobNameOrPo;
    }
    if ("lineItems" in patch && expected !== "lineItems") {
      delete patch.lineItems;
    }
    if ("neededBy" in patch && expected !== "neededBy" && "needBy" in patch && expected !== "neededBy") {
      delete patch.neededBy;
      delete patch.needBy;
    }
    
    // Apply safe patch
    for (const [key, value] of Object.entries(patch)) {
      if (key === "lineItems") {
        // Special case: lineItems - merge with existing if both exist, otherwise replace
        if (value !== undefined && Array.isArray(value)) {
          const existingLineItems = Array.isArray(merged.lineItems) ? merged.lineItems : [];
          if (existingLineItems.length > 0 && value.length > 0) {
            // Merge: combine both arrays and dedupe
            const combined = [...existingLineItems, ...value];
            // Dedupe by description (case-insensitive) and sum quantities for duplicates
            const dedupedMap = new Map<string, AgentLineItem>();
            for (const item of combined) {
              const key = item.description.toLowerCase().trim();
              const existing = dedupedMap.get(key);
              if (existing) {
                // Sum quantities for duplicates
                dedupedMap.set(key, {
                  ...existing,
                  quantity: existing.quantity + item.quantity,
                });
              } else {
                dedupedMap.set(key, item);
              }
            }
            merged.lineItems = Array.from(dedupedMap.values());
          } else {
            // Replace if one is empty
            merged.lineItems = value;
          }
        }
      } else if (key === "notes") {
        // Special case: NEVER auto-populate notes
        // Ignore notes from decision.updatedDraft
        // Keep existing notes if user manually set, otherwise leave blank
        // (don't modify merged.notes)
      } else {
        // Normal merge
        merged[key] = value;
      }
    }
    
    return merged;
  }

  // Merge decision.updatedDraft into existing draft using safe merge
  const mergedDraft = decision.updatedDraft 
    ? mergeDraftSafe(existingDraft, decision.updatedDraft)
    : existingDraft;

  // RULE 1: Slot Resolution Is Final - Lock newly resolved slots
  // Get existing resolved slots (normalize Set/Array to Set)
  let resolvedSlots = new Set<string>();
  if (existingDraft.__resolvedSlots) {
    if (Array.isArray(existingDraft.__resolvedSlots)) {
      resolvedSlots = new Set(existingDraft.__resolvedSlots);
    } else if (existingDraft.__resolvedSlots instanceof Set) {
      resolvedSlots = new Set(existingDraft.__resolvedSlots);
    }
  }
  
  // Lock newly resolved slots from this turn
  const newlyResolved = (decision.updatedDraft as any)?.__newlyResolvedSlots;
  if (Array.isArray(newlyResolved)) {
    for (const slot of newlyResolved) {
      resolvedSlots.add(slot);
    }
  }
  
  // Store resolved slots (as array for JSON serialization)
  if (resolvedSlots.size > 0) {
    (mergedDraft as any).__resolvedSlots = Array.from(resolvedSlots);
  } else {
    (mergedDraft as any).__resolvedSlots = undefined;
  }
  
  // Clean up temporary metadata
  delete (mergedDraft as any).__newlyResolvedSlots;

  // Maintain router-only metadata: __lastAskedSlot
  if (decision.readyToDispatch) {
    // Clear __lastAskedSlot when ready to dispatch
    mergedDraft.__lastAskedSlot = undefined;
  } else if (decision.missingSlots && decision.missingSlots.length > 0) {
    // Set __lastAskedSlot to the first missing slot
    // Ensure jobNameOrPo is included when missing
    const firstMissing = decision.missingSlots[0];
    mergedDraft.__lastAskedSlot = firstMissing;
    
    // If jobNameOrPo is missing, ensure it's tracked
    if (decision.missingSlots.includes("jobNameOrPo") && !mergedDraft.__lastAskedSlot) {
      mergedDraft.__lastAskedSlot = "jobNameOrPo";
    }
  } else {
    // No missing slots but not ready - clear it
    mergedDraft.__lastAskedSlot = undefined;
  }

  // Save draft via canonical merge point and update last processed key
  await applyDraftPatch(threadId, mergedDraft);
  setLastProcessedKey(threadId, decision.idempotencyKey);

  return {
    draft: mergedDraft,
    skippedAsDuplicate: false,
    nextQuestion: decision.nextQuestion,
    readyToDispatch: decision.readyToDispatch,
  };
}

