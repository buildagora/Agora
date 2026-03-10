/**
 * Canonical Agent Conversation State - Single Source of Truth
 * 
 * This is the ONLY source of truth for agent conversation state.
 * All agent logic must read from and write to this state.
 */

import type { CategoryId } from "@/lib/categoryIds";
import type { ThreadState } from "@/lib/threadState";
import { computeRfqStatus, type FieldId } from "@/lib/agent/rfqStatus";

/**
 * Slot normalization map
 * Maps all aliases to canonical slot keys
 */
const SLOT_ALIAS_MAP: Record<string, string> = {
  // needBy aliases
  needBy: "needBy",
  neededBy: "needBy",
  "timeline.needByDate": "needBy",
  
  // fulfillmentType aliases
  delivery: "fulfillmentType",
  fulfillmentType: "fulfillmentType",
  "delivery.pickupOrDelivery": "fulfillmentType",
  pickup: "fulfillmentType", // Special: maps to fulfillmentType = "PICKUP"
  
  // deliveryAddress aliases
  addressZip: "deliveryAddress",
  deliveryAddress: "deliveryAddress",
  
  // categoryId aliases
  category: "categoryId",
  categoryId: "categoryId",
  categoryLabel: "categoryLabel",
  
  // Direct mappings (no aliases)
  jobNameOrPo: "jobNameOrPo",
  lineItems: "lineItems",
  visibility: "visibility", // RFQ routing scope: "broadcast" (all eligible) or "direct" (preferred suppliers only)
};

/**
 * Normalize a slot key to its canonical form
 * CRITICAL: The agent must NEVER read raw slot names again
 */
export function normalizeSlotKey(key: string): string {
  return SLOT_ALIAS_MAP[key] || key;
}

/**
 * Normalize slot value based on key
 * Special handling for pickup → fulfillmentType = "PICKUP"
 */
export function normalizeSlotValue(key: string, value: unknown): unknown {
  const normalizedKey = normalizeSlotKey(key);
  
  // Special case: pickup → fulfillmentType = "PICKUP"
  if (key === "pickup" || (normalizedKey === "fulfillmentType" && value === "pickup")) {
    return "PICKUP";
  }
  
  // Normalize fulfillmentType aliases to canonical values
  if (normalizedKey === "fulfillmentType" && typeof value === "string") {
    const v = value.trim().toLowerCase();
    // Convert "delivery"/"delivered"/"deliver" => "DELIVERY"
    if (v.includes("deliver")) {
      return "DELIVERY";
    }
    // Convert "pickup"/"pick up" => "PICKUP"
    if (v.includes("pickup") || v.includes("pick up")) {
      return "PICKUP";
    }
    // Normalize existing canonical values to uppercase
    const upper = value.toUpperCase();
    if (upper === "PICKUP" || upper === "DELIVERY") {
      return upper;
    }
  }
  
  // Special case: delivery key → fulfillmentType = "DELIVERY"
  if (key === "delivery" && typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v.includes("deliver")) {
      return "DELIVERY";
    }
  }
  
  return value;
}

/**
 * Readiness state
 */
export interface ReadinessState {
  isReadyForPricing: boolean;
  isReadyForDispatch: boolean;
  missingSlots: string[];
}

/**
 * Dispatch status
 */
export interface DispatchStatus {
  confirmed: boolean;
  confirmedAt?: string;
  dispatched: boolean;
  dispatchedAt?: string;
  requestId?: string;
  error?: string;
}

/**
 * Last agent action
 */
export interface LastAgentAction {
  slot?: string;
  question?: string;
  timestamp?: string;
}

/**
 * Agent Conversation State
 * Single source of truth for all agent state
 */
export interface AgentConversationState {
  threadId: string;
  slots: Record<string, unknown>; // Raw slots (may contain aliases)
  normalizedSlots: Record<string, unknown>; // All slots normalized to canonical keys
  resolvedSlots: Set<string>; // Set of resolved slot keys (canonical)
  requiredSlots: string[]; // Required slots for pricing/dispatch (canonical)
  readiness: ReadinessState;
  lastAgentAction?: LastAgentAction;
  dispatchStatus: DispatchStatus;
}

/**
 * Map FieldId from rfqStatus to slot names used in AgentConversationState
 */
function mapFieldIdToSlotName(fieldId: FieldId): string {
  switch (fieldId) {
    case "needBy":
      return "needBy"; // canonical key
    default:
      return fieldId;
  }
}

/**
 * Map slot names from AgentConversationState to FieldId for rfqStatus
 */
function mapSlotNameToFieldId(slot: string): FieldId | null {
  switch (slot) {
    case "needBy":
      return "needBy"; // rfqStatus uses "needBy"
    case "categoryId":
    case "fulfillmentType":
    case "deliveryAddress":
    case "lineItems":
    case "visibility":
    case "jobNameOrPo":
    case "jobType":
    case "roofType":
      return slot as FieldId;
    default:
      return null;
  }
}

/**
 * Required slots for pricing confirmation
 * DEPRECATED: Use computeRfqStatus instead. Kept for backward compatibility.
 */
const REQUIRED_FOR_PRICING: readonly string[] = [
  "jobNameOrPo",
  "lineItems",
  "needBy",
  "fulfillmentType",
  "visibility", // Scope: "broadcast" (all eligible) or "direct" (preferred suppliers only)
] as const;

/**
 * Required slots for dispatch
 * DEPRECATED: Use computeRfqStatus instead. Kept for backward compatibility.
 */
function getRequiredForDispatch(state: AgentConversationState): string[] {
  // Use computeRfqStatus as the source of truth
  const rfqStatus = computeRfqStatus({
    draft: state.normalizedSlots,
    threadState: undefined, // Not needed for status computation
  });
  
  // Map FieldIds back to slot names
  return rfqStatus.missingRequired.map(mapFieldIdToSlotName);
}

/**
 * Check if a slot has a value
 * Exported for validation in agent turn route
 */
export function hasSlotValue(state: AgentConversationState, slot: string): boolean {
  const normalizedKey = normalizeSlotKey(slot);
  const value = state.normalizedSlots[normalizedKey];
  
  switch (normalizedKey) {
    case "jobNameOrPo":
      return typeof value === "string" && value.trim().length > 0;
    case "lineItems":
      return Array.isArray(value) && value.length > 0;
    case "needBy":
      return typeof value === "string" && value.trim().length > 0;
    case "fulfillmentType":
      return value === "PICKUP" || value === "DELIVERY";
    case "deliveryAddress":
      return typeof value === "string" && value.trim().length > 0;
    case "categoryId":
      return typeof value === "string" && value.length > 0;
    case "visibility":
      // Visibility is satisfied when it's "broadcast" or "direct"
      return value === "broadcast" || value === "direct";
    default:
      return value !== undefined && value !== null;
  }
}

/**
 * Check if a slot is resolved
 */
function isSlotResolved(state: AgentConversationState, slot: string): boolean {
  const normalizedKey = normalizeSlotKey(slot);
  return state.resolvedSlots.has(normalizedKey);
}

/**
 * Compute readiness state
 * SINGLE SOURCE OF TRUTH: Uses computeRfqStatus from rfqStatus.ts
 */
function computeReadiness(state: AgentConversationState): ReadinessState {
  // Use computeRfqStatus as the single source of truth
  const rfqStatus = computeRfqStatus({
    draft: state.normalizedSlots,
    threadState: undefined, // Not needed for status computation
  });
  
  // Map FieldIds to slot names for backward compatibility
  const missingSlots = rfqStatus.missingRequired.map(mapFieldIdToSlotName);
  
  return {
    isReadyForPricing: rfqStatus.isReadyToConfirm,
    isReadyForDispatch: rfqStatus.isReadyToDispatch,
    missingSlots,
  };
}

/**
 * Create initial state from thread draft and thread state
 * CRITICAL: Dispatch status (confirmed/dispatched/requestId) comes ONLY from ThreadState.dispatch, NOT from draft.
 */
export function createAgentConversationState(
  threadId: string,
  draft: Record<string, unknown>,
  threadState?: ThreadState | null
): AgentConversationState {
  // Normalize all slots
  const normalizedSlots: Record<string, unknown> = {};
  const resolvedSlots = new Set<string>();
  
  // Process all draft keys
  for (const [key, value] of Object.entries(draft)) {
    if (key.startsWith("__")) {
      // Skip metadata keys for now (will be handled separately)
      continue;
    }
    
    const normalizedKey = normalizeSlotKey(key);
    let normalizedValue = normalizeSlotValue(key, value);
    
    // Ensure visibility is set separately
    if (key === "visibility" || normalizedKey === "visibility") {
      normalizedSlots.visibility = (value as string) ?? "broadcast";
      continue;
    }
    
    // Only set normalized value if it's valid
    if (normalizedValue !== undefined && normalizedValue !== null) {
      normalizedSlots[normalizedKey] = normalizedValue;
    }
    
    // If value is set, mark as resolved
    if (normalizedValue !== undefined && normalizedValue !== null) {
      if (normalizedKey === "lineItems") {
        if (Array.isArray(normalizedValue) && normalizedValue.length > 0) {
          resolvedSlots.add(normalizedKey);
        }
      } else if (typeof normalizedValue === "string" && normalizedValue.trim().length > 0) {
        resolvedSlots.add(normalizedKey);
      } else if (typeof normalizedValue !== "string") {
        resolvedSlots.add(normalizedKey);
      }
    }
  }
  
  // Ensure visibility defaults to "broadcast" if not set
  if (normalizedSlots.visibility === undefined) {
    normalizedSlots.visibility = "broadcast";
  }
  
  // Process dispatch status - CRITICAL: Read ONLY from ThreadState.dispatch, NOT from draft
  // Legacy dispatch flags are migrated to state
  // and should not be read here. They are only migrated in splitDraftAndState.
  const dispatchStatus: DispatchStatus = {
    confirmed: threadState?.dispatch?.status === "CONFIRMED" || threadState?.dispatch?.status === "DISPATCHING" || threadState?.dispatch?.status === "DISPATCHED",
    confirmedAt: threadState?.dispatch?.confirmedAt,
    dispatched: threadState?.dispatch?.status === "DISPATCHED",
    dispatchedAt: threadState?.dispatch?.dispatchedAt,
    requestId: threadState?.dispatch?.requestId,
    error: threadState?.dispatch?.error,
  };
  
  // No lastAgentAction - legacy slot tracking removed
  const lastAgentAction: LastAgentAction | undefined = undefined;
  
  const state: AgentConversationState = {
    threadId,
    slots: { ...draft },
    normalizedSlots,
    resolvedSlots,
    requiredSlots: [], // Will be computed after readiness
    readiness: {
      isReadyForPricing: false,
      isReadyForDispatch: false,
      missingSlots: [],
    },
    lastAgentAction,
    dispatchStatus,
  };
  
  // Compute readiness (this also determines required slots)
  state.readiness = computeReadiness(state);
  state.requiredSlots = getRequiredForDispatch(state);
  
  return state;
}

/**
 * Update state with slot values
 * Automatically normalizes keys and values
 */
export function updateStateSlots(
  state: AgentConversationState,
  updates: Record<string, unknown>
): AgentConversationState {
  const newState = { ...state };
  const newNormalizedSlots = { ...state.normalizedSlots };
  const newResolvedSlots = new Set(state.resolvedSlots);
  const newSlots = { ...state.slots };
  
  // Process updates
  for (const [key, value] of Object.entries(updates)) {
    if (key.startsWith("__")) {
      // Handle metadata separately
      continue;
    }
    
    const normalizedKey = normalizeSlotKey(key);
    const normalizedValue = normalizeSlotValue(key, value);
    
    // Update raw slots
    newSlots[key] = value;
    
    // Update normalized slots
    if (normalizedValue !== undefined && normalizedValue !== null) {
      newNormalizedSlots[normalizedKey] = normalizedValue;
      
      // Mark as resolved if value is meaningful
      if (normalizedKey === "lineItems") {
        if (Array.isArray(normalizedValue) && normalizedValue.length > 0) {
          newResolvedSlots.add(normalizedKey);
        }
      } else if (typeof normalizedValue === "string" && normalizedValue.trim().length > 0) {
        newResolvedSlots.add(normalizedKey);
      } else if (typeof normalizedValue !== "string") {
        newResolvedSlots.add(normalizedKey);
      }
    }
  }
  
  // CRITICAL: Do NOT update dispatch status from draft flags in updateStateSlots
  // Dispatch status must be updated via ThreadState.dispatch only (in the turn route)
  // Legacy dispatch flags are ignored here (they belong in ThreadState.dispatch)
  // They are only migrated to state in splitDraftAndState, not read for dispatch truth
  
  // CRITICAL: Re-validate all existing resolved slots - remove any that don't have values
  // This ensures resolvedSlots is always derived from actual draft values, not legacy __resolvedSlots
  for (const resolvedSlot of Array.from(newResolvedSlots)) {
    if (!hasSlotValue({ normalizedSlots: newNormalizedSlots, resolvedSlots: new Set() } as AgentConversationState, resolvedSlot)) {
      newResolvedSlots.delete(resolvedSlot);
    }
  }
  
  // No lastAgentAction updates - legacy slot tracking removed
  
  newState.slots = newSlots;
  newState.normalizedSlots = newNormalizedSlots;
  newState.resolvedSlots = newResolvedSlots;
  newState.readiness = computeReadiness(newState);
  newState.requiredSlots = getRequiredForDispatch(newState);
  
  return newState;
}

/**
 * Get next missing slot (deterministic order)
 * SINGLE SOURCE OF TRUTH: Uses computeRfqStatus().nextQuestionId
 */
export function getNextMissingSlot(state: AgentConversationState): string | null {
  // Use computeRfqStatus as the single source of truth for next question
  const rfqStatus = computeRfqStatus({
    draft: state.normalizedSlots,
    threadState: undefined, // Not needed for status computation
  });
  
  if (!rfqStatus.nextQuestionId) {
    return null;
  }
  
  // Map FieldId to slot name
  return mapFieldIdToSlotName(rfqStatus.nextQuestionId);
}

/**
 * Check if pricing can be confirmed
 */
export function canConfirmPricing(state: AgentConversationState): boolean {
  return state.readiness.isReadyForPricing && !state.dispatchStatus.confirmed;
}

/**
 * Check if dispatch can proceed
 */
export function canDispatch(state: AgentConversationState): boolean {
  return state.readiness.isReadyForDispatch && state.dispatchStatus.confirmed && !state.dispatchStatus.dispatched;
}

/**
 * Serialize state for storage/API
 */
export function serializeState(state: AgentConversationState): Record<string, unknown> {
  return {
    threadId: state.threadId,
    slots: state.slots,
    normalizedSlots: state.normalizedSlots,
    resolvedSlots: Array.from(state.resolvedSlots),
    requiredSlots: state.requiredSlots,
    readiness: state.readiness,
    lastAgentAction: state.lastAgentAction,
    dispatchStatus: state.dispatchStatus,
  };
}

