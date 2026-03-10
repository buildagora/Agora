/**
 * Agent Draft to RFQ Translator
 * Converts AgentDraftRFQ to the RFQ format used by the existing create flow
 */

import type { AgentDraftRFQ } from "./contracts";
import { categoryIdToLabel } from "@/lib/categoryIds";
// Removed storage imports - RFQ number generation now uses API

/**
 * RFQ structure matching the existing create flow
 */
export interface RFQPayload {
  id: string;
  rfqNumber: string;
  status: "DRAFT" | "OPEN" | "PUBLISHED" | "AWARDED" | "CLOSED"; // Added DRAFT and PUBLISHED
  createdAt: string;
  title: string;
  notes: string;
  category: string; // CRITICAL: Required field
  categoryId?: string; // CRITICAL: Required by /api/buyer/rfqs schema
  buyerId?: string;
  visibility?: "broadcast" | "direct"; // Added visibility field
  targetSupplierIds?: string[]; // Added for direct RFQs
  lineItems: Array<{
    description: string;
    unit: string;
    quantity: number;
  }>;
  terms: {
    fulfillmentType: "PICKUP" | "DELIVERY";
    requestedDate: string;
    deliveryPreference?: "MORNING" | "ANYTIME";
    deliveryInstructions?: string;
    location?: string; // Only for DELIVERY
  };
}

// RFQ number generation is handled server-side in /api/buyer/rfqs POST endpoint
// Client should not generate RFQ numbers - API is source of truth

/**
 * Normalize address (simple normalization - matching existing flow)
 */
function normalizeAddress(address: string): string {
  // Basic normalization: trim and capitalize first letter of each word
  return address
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Convert AgentDraftRFQ to RFQ payload for creation
 * 
 * Mapping rules:
 * - jobNameOrPo -> title
 * - categoryId -> category (using label)
 * - fulfillmentType -> terms.fulfillmentType
 * - deliveryAddress -> terms.location (only for DELIVERY)
 * - needBy -> terms.requestedDate
 * - lineItems -> lineItems (map qty/unit/description)
 * - notes: only include if user explicitly set (never auto-generated)
 * - priority + visibility: omitted (not in existing API)
 */
export function agentDraftToCreatePayload(
  draft: AgentDraftRFQ,
  buyerId: string
): RFQPayload {
  // Convert categoryId to category label (CRITICAL: API requires category string)
  // Must have either categoryLabel or categoryId
  if (!draft.categoryLabel && !draft.categoryId) {
    throw new Error("Category is required. Please select a category in the Execution Panel.");
  }
  // CRITICAL: Ensure category is always a string - never undefined
  const categoryLabel = draft.categoryLabel || (draft.categoryId ? categoryIdToLabel[draft.categoryId as keyof typeof categoryIdToLabel] : null);
  if (!categoryLabel) {
    throw new Error("Category is required. Unable to convert categoryId to label.");
  }
  
  // Normalize delivery address if DELIVERY
  const normalizedLocation =
    draft.fulfillmentType === "DELIVERY" && draft.deliveryAddress
      ? normalizeAddress(draft.deliveryAddress)
      : undefined;
  
  // Map line items
  const lineItems = draft.lineItems.map((item) => ({
    description: item.description,
    unit: item.unit || "EA",
    quantity: item.quantity,
  }));
  
  // Build terms
  const terms: RFQPayload["terms"] = {
    fulfillmentType: draft.fulfillmentType,
    requestedDate: draft.needBy === "ASAP" 
      ? new Date().toISOString().split("T")[0] // Today's date for ASAP
      : (draft.needBy || new Date().toISOString().split("T")[0]),
    ...(draft.fulfillmentType === "DELIVERY" && normalizedLocation && {
      location: normalizedLocation,
    }),
  };
  
  // Build payload
  // Default visibility to "broadcast" (reverse auction) if not specified
  const visibility = draft.visibility || "broadcast";
  
  // Determine status: OPEN for broadcast (appears in feed immediately), DRAFT for direct
  const defaultStatus = visibility === "direct" ? "DRAFT" : "OPEN";
  
  const payload: RFQPayload = {
    id: crypto.randomUUID(),
    rfqNumber: "", // Will be generated server-side by API
    status: defaultStatus, // OPEN for broadcast, DRAFT for direct
    createdAt: new Date().toISOString(),
    title: draft.jobNameOrPo || "Untitled Request",
    notes: draft.notes || "", // Only include if user set it (never auto-populate)
    category: categoryLabel,
    categoryId: draft.categoryId, // ✅ CRITICAL: required by /api/buyer/rfqs schema
    buyerId,
    visibility, // Always include visibility (defaults to "broadcast")
    // Include targetSupplierIds only if visibility is "direct"
    ...(visibility === "direct" && draft.targetSupplierIds && draft.targetSupplierIds.length > 0 && {
      targetSupplierIds: draft.targetSupplierIds,
    }),
    lineItems,
    terms,
  };
  
  return payload;
}
