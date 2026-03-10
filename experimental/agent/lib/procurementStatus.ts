/**
 * Procurement Status - Extended Readiness Computation
 * Includes categoryId and visibility in required fields
 * 
 * This extends computeRfqStatus to include procurement-specific fields
 * that are required for RFQ creation but not in the base FieldId type
 */

import { computeRfqStatus, type FieldId } from "./rfqStatus";
import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";

export type ProcurementFieldId = "categoryId" | "visibility" | FieldId;

export interface ProcurementStatus {
  missingRequired: ProcurementFieldId[];
  isReadyToConfirm: boolean;
  nextQuestionId: ProcurementFieldId | null;
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
 * Check if a procurement field has a valid value
 */
function hasProcurementFieldValue(draft: any, fieldId: ProcurementFieldId): boolean {
  switch (fieldId) {
    case "categoryId":
      // CRITICAL: Check canonical draft key - categoryId must be non-empty string
      const categoryId = draft.categoryId;
      if (!categoryId || typeof categoryId !== "string") return false;
      const trimmedCategoryId = categoryId.trim();
      if (!trimmedCategoryId) return false;
      return trimmedCategoryId in categoryIdToLabel;
    
    case "visibility":
      // CRITICAL: Check canonical draft key - visibility must be "broadcast" or "direct"
      const visibility = draft.visibility;
      return visibility === "broadcast" || visibility === "direct";
    
    case "fulfillmentType":
      // CRITICAL: Check canonical draft key - fulfillmentType (not delivery.pickupOrDelivery)
      const fulfillmentType = draft.fulfillmentType;
      if (!fulfillmentType) return false;
      const normalizedFulfillment = String(fulfillmentType).toUpperCase();
      return normalizedFulfillment === "PICKUP" || normalizedFulfillment === "DELIVERY";
    
    case "needBy":
      // CRITICAL: Check canonical draft key - needBy (not neededBy or timeline.needByDate)
      // Priority: needBy > neededBy (neededBy is alias)
      const needBy = draft.needBy || (draft as any).neededBy;
      if (!needBy) return false;
      // Treat "ASAP" as a valid resolved value (case-insensitive)
      const needByStr = String(needBy).trim();
      if (needByStr.toUpperCase() === "ASAP") return true;
      // Otherwise, fall back to ISO date validation
      return isValidISODate(needByStr);
    
    case "jobNameOrPo":
      // CRITICAL: Check canonical draft key - jobNameOrPo must be non-empty string
      const jobNameOrPo = draft.jobNameOrPo;
      if (!jobNameOrPo || typeof jobNameOrPo !== "string") return false;
      return jobNameOrPo.trim().length > 0;
    
    case "lineItems":
      // CRITICAL: Check canonical draft key - lineItems must be non-empty array
      if (!Array.isArray(draft.lineItems)) return false;
      return draft.lineItems.length > 0;
    
    case "deliveryAddress":
      // CRITICAL: Check canonical draft key - deliveryAddress must be non-empty string
      const deliveryAddress = draft.deliveryAddress;
      if (!deliveryAddress || typeof deliveryAddress !== "string") return false;
      return deliveryAddress.trim().length > 0;
    
    case "buyerContact":
      // Always true - comes from authenticated user context
      return true;
    
    default:
      return false;
  }
}

/**
 * Compute procurement status with extended required fields
 * 
 * Required priority order (exact):
 * 1) categoryId
 * 2) lineItems (non-empty)
 * 3) needBy/neededBy (date)
 * 4) fulfillmentType (PICKUP|DELIVERY)
 * 5) visibility (broadcast|direct)
 * 6) deliveryAddress (ONLY when fulfillmentType=DELIVERY)
 * 
 * NOTE: jobNameOrPo, jobType, buildingType, color, etc. are NOT required and must never gate dispatch.
 */
export function computeProcurementStatus(input: {
  draft: any;
  threadState?: any;
}): ProcurementStatus {
  const { draft, threadState } = input;
  
  // EXACT priority order as specified - REQUIRED SLOTS ONLY
  const REQUIRED_PRIORITY: ProcurementFieldId[] = [
    "categoryId",
    "lineItems",
    "needBy",
    "fulfillmentType",
    "visibility",
    "deliveryAddress", // only if fulfillmentType === "DELIVERY"
  ];
  
  // Check if delivery address is required
  const fulfillmentType = draft.fulfillmentType || draft.delivery?.pickupOrDelivery;
  const isDelivery = fulfillmentType === "DELIVERY" || fulfillmentType === "delivery";
  
  // Filter REQUIRED_PRIORITY to only include fields that are actually required
  const requiredFields: ProcurementFieldId[] = REQUIRED_PRIORITY.filter(fieldId => {
    if (fieldId === "deliveryAddress" && !isDelivery) {
      return false; // Skip deliveryAddress if not delivery
    }
    return true;
  });
  
  // Check which required fields are missing
  const missingRequired: ProcurementFieldId[] = [];
  for (const fieldId of requiredFields) {
    if (!hasProcurementFieldValue(draft, fieldId)) {
      missingRequired.push(fieldId);
    }
  }
  
  // Readiness: all required fields must be present
  const isReadyToConfirm = missingRequired.length === 0;
  
  // Deterministic next question: first missingRequired in priority order
  let nextQuestionId: ProcurementFieldId | null = null;
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
    isReadyToConfirm,
    nextQuestionId,
  };
}

