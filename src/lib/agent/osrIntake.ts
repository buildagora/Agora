/**
 * OSR Intake State Management
 * Determines what fields are missing and what question to ask next
 */

import type { OSRDraft } from "./osrQuestions";
import { getOSRQuestion } from "./osrQuestions";

export interface IntakeState {
  nextSlot?: string;
  nextQuestion: string;
  missingFields: string[];
  ready: boolean;
}

/**
 * Get resolved slots from draft (normalize Set/Array to Set)
 */
function getResolvedSlotsOSR(draft: Partial<OSRDraft>): Set<string> {
  if (!draft.__resolvedSlots) {
    return new Set();
  }
  if (Array.isArray(draft.__resolvedSlots)) {
    return new Set(draft.__resolvedSlots);
  }
  if (draft.__resolvedSlots instanceof Set) {
    return draft.__resolvedSlots;
  }
  return new Set();
}

/**
 * Check if a slot is resolved (locked)
 */
function isSlotResolvedOSR(draft: Partial<OSRDraft>, slot: string): boolean {
  const resolvedSlots = getResolvedSlotsOSR(draft);
  return resolvedSlots.has(slot);
}

/**
 * Get intake state for OSR draft
 * CRITICAL: Exclude resolved slots from missing fields
 */
export function getIntakeState(
  draft: Partial<OSRDraft>,
  lastAskedSlot?: string
): IntakeState {
  const { question, slot } = getOSRQuestion(draft, lastAskedSlot);
  
  // Determine missing fields based on OSR draft structure
  // CRITICAL: Never include resolved slots in missing fields
  const missingFields: string[] = [];
  
  if (!draft.jobNameOrPo && !isSlotResolvedOSR(draft, "jobNameOrPo")) {
    missingFields.push("jobNameOrPo");
  }
  if ((!draft.lineItems || draft.lineItems.length === 0) && !isSlotResolvedOSR(draft, "lineItems")) {
    missingFields.push("lineItems");
  }
  if ((!draft.neededBy && !draft.timeline?.needByDate) && !isSlotResolvedOSR(draft, "neededBy") && !isSlotResolvedOSR(draft, "needBy")) {
    missingFields.push("neededBy");
  }
  if (!draft.jobType && !isSlotResolvedOSR(draft, "jobType")) {
    missingFields.push("jobType");
  }
  if (!draft.roofType && !isSlotResolvedOSR(draft, "roofType")) {
    missingFields.push("roofType");
  }
  if ((!draft.roofSize || (!draft.roofSize.squares && !draft.roofSize.sqft)) && !isSlotResolvedOSR(draft, "roofSize")) {
    missingFields.push("roofSize");
  }
  if (!draft.addressZip && !isSlotResolvedOSR(draft, "addressZip")) {
    missingFields.push("addressZip");
  }
  if ((!draft.delivery?.pickupOrDelivery && !draft.fulfillmentType) && !isSlotResolvedOSR(draft, "delivery") && !isSlotResolvedOSR(draft, "fulfillmentType")) {
    missingFields.push("delivery");
  }
  
  // Ready if we have the critical fields: jobNameOrPo, lineItems, neededBy
  const ready = 
    !!draft.jobNameOrPo &&
    !!draft.lineItems && draft.lineItems.length > 0 &&
    (!!draft.neededBy || !!draft.timeline?.needByDate);
  
  return {
    nextSlot: slot || undefined,
    nextQuestion: question,
    missingFields,
    ready,
  };
}

/**
 * Get missing roofing-specific fields
 */
export function getMissingRoofingFields(draft: Partial<OSRDraft>): string[] {
  const state = getIntakeState(draft);
  return state.missingFields;
}
