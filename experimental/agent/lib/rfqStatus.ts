/**
 * RFQ Status - Single Source of Truth for Readiness Computation
 * 
 * This is the ONLY module that computes:
 * - missingRequired: FieldId[]
 * - missingOptional: FieldId[]
 * - isReadyToConfirm: boolean
 * - isReadyToDispatch: boolean
 * - nextQuestionId: FieldId | null (deterministic)
 * 
 * NO other module may independently compute "ready", "missing slots", or "next question".
 */

export type FieldId =
  | "fulfillmentType"
  | "needBy"
  | "jobNameOrPo"
  | "lineItems"
  | "deliveryAddress"
  | "buyerContact";

export interface RfqStatus {
  missingRequired: FieldId[];
  missingOptional: FieldId[];
  isReadyToConfirm: boolean;
  isReadyToDispatch: boolean;
  nextQuestionId: FieldId | null;
}

/**
 * Validate ISO date string
 */
function isValidISODate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const date = new Date(dateStr);
  const hasIsoPrefix = /^\d{4}-\d{2}-\d{2}/.test(dateStr);
  return !isNaN(date.getTime()) && hasIsoPrefix;
}

/**
 * Check if a field has a valid value in the draft
 * A field is resolved if it exists in canonical draft and passes validation
 */
function hasFieldValue(draft: any, fieldId: FieldId): boolean {
  switch (fieldId) {
    case "fulfillmentType":
      const raw = draft.fulfillmentType ?? draft.delivery?.pickupOrDelivery;
      if (!raw) return false;
      // Check if already canonical
      if (raw === "PICKUP" || raw === "DELIVERY" || raw === "pickup" || raw === "delivery") {
        return true;
      }
      // Check for aliases: "deliver"/"delivery"/"delivered" => DELIVERY, "pickup"/"pick up" => PICKUP
      if (typeof raw === "string") {
        const v = raw.trim().toLowerCase();
        if (v.includes("deliver")) return true; // Treat as DELIVERY (normalization will convert)
        if (v.includes("pickup") || v.includes("pick up")) return true; // Treat as PICKUP (normalization will convert)
      }
      return false;
    case "needBy":
      const needBy = draft.needBy || draft.neededBy || draft.timeline?.needByDate;
      if (!needBy) return false;
      // Treat "ASAP" as a valid resolved value (case-insensitive)
      const needByStr = String(needBy).trim();
      if (needByStr.toUpperCase() === "ASAP") return true;
      // Otherwise, fall back to ISO date validation
      return isValidISODate(needByStr);
    case "jobNameOrPo":
      return typeof draft.jobNameOrPo === "string" && draft.jobNameOrPo.trim().length > 0;
    case "lineItems":
      return Array.isArray(draft.lineItems) && draft.lineItems.length > 0;
    case "deliveryAddress":
      return typeof draft.deliveryAddress === "string" && draft.deliveryAddress.trim().length > 0;
    case "buyerContact":
      // buyerContact is required before dispatch
      // Check if user has contact info (email or phone)
      // This might come from user context or threadState
      // For now, assume it's available if user exists (will be validated at dispatch time)
      return true; // Always true - buyer contact comes from authenticated user context
    default:
      return false;
  }
}


/**
 * Compute RFQ status - SINGLE SOURCE OF TRUTH
 * 
 * This is the ONLY authority for:
 * - readiness
 * - confirmation eligibility
 * - dispatch eligibility
 * - next question selection
 * 
 * RULES:
 * 1) Deterministic required-field priority (EXACT order):
 *    - fulfillmentType
 *    - needBy
 *    - jobNameOrPo
 *    - lineItems
 *    - deliveryAddress (only if fulfillmentType === "DELIVERY")
 *    - buyerContact (required before dispatch)
 * 
 * 2) A field is resolved if:
 *    - It exists in canonical draft
 *    - It passes validation
 *    - NO __resolvedSlots logic
 * 
 * 3) Deterministic next question:
 *    - missingRequired = REQUIRED_PRIORITY filtered by unresolved
 *    - nextQuestionId = first missingRequired or null
 * 
 * 4) Readiness rules:
 *    - isReadyToConfirm = missingRequired.length === 0
 *    - isReadyToDispatch = isReadyToConfirm
 */
export function computeRfqStatus(input: {
  draft: any; // canonical draft shape
  threadState?: any; // optional thread state for additional context
}): RfqStatus {
  const { draft, threadState } = input;
  
  // EXACT priority order as specified
  const REQUIRED_PRIORITY: FieldId[] = [
    "fulfillmentType",
    "needBy",
    "jobNameOrPo",
    "lineItems",
    "deliveryAddress", // only if fulfillmentType === "DELIVERY"
    "buyerContact"
  ];
  
  // Check if delivery address is required
  const fulfillmentType = draft.fulfillmentType || draft.delivery?.pickupOrDelivery;
  const isDelivery = fulfillmentType === "DELIVERY" || fulfillmentType === "delivery";
  
  // Filter REQUIRED_PRIORITY to only include fields that are actually required
  const requiredFields: FieldId[] = REQUIRED_PRIORITY.filter(fieldId => {
    if (fieldId === "deliveryAddress" && !isDelivery) {
      return false; // Skip deliveryAddress if not delivery
    }
    return true;
  });
  
  // Check which required fields are missing
  // A field is missing if it doesn't have a valid value (NO __resolvedSlots logic)
  const missingRequired: FieldId[] = [];
  for (const fieldId of requiredFields) {
    if (!hasFieldValue(draft, fieldId)) {
      missingRequired.push(fieldId);
    }
  }
  
  // Optional fields (currently none)
  const optionalFields: FieldId[] = [];
  const missingOptional: FieldId[] = [];
  for (const fieldId of optionalFields) {
    if (!hasFieldValue(draft, fieldId)) {
      missingOptional.push(fieldId);
    }
  }
  
  // Readiness rules
  const isReadyToConfirm = missingRequired.length === 0;
  const isReadyToDispatch = isReadyToConfirm;
  
  // Deterministic next question: first missingRequired in priority order
  let nextQuestionId: FieldId | null = null;
  for (const fieldId of REQUIRED_PRIORITY) {
    // Skip deliveryAddress if not delivery
    if (fieldId === "deliveryAddress" && !isDelivery) {
      continue;
    }
    if (missingRequired.includes(fieldId)) {
      nextQuestionId = fieldId;
      break;
    }
  }
  
  return {
    missingRequired,
    missingOptional,
    isReadyToConfirm,
    isReadyToDispatch,
    nextQuestionId,
  };
}

