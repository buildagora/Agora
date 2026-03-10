/**
 * Offline Filter for Roofing RFQs
 * Extracts roofing-specific fields from message text without LLM
 */

export interface RoofingDraft {
  category?: string;
  jobType?: "repair" | "replace" | "new" | "insurance";
  roofType?: "shingle" | "metal" | "flat_tpo" | "flat_epdm" | "modified_bitumen" | "other";
  roofSize?: { squares?: number; sqft?: number };
  addressZip?: string | null;
  delivery?: { pickupOrDelivery?: "pickup" | "delivery" | null };
  timeline?: { needByDate?: string | null; urgency?: "rush" | "standard" | null };
  lineItems?: Array<{ description: string; quantity: number; unit?: string }>;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  neededBy?: string;
  jobNameOrPo?: string;
}

export interface OfflineFilterResult {
  patch: Record<string, unknown>;
}

/**
 * Extract roofing fields from message using pattern matching
 */
export function offlineFilterRoofing(
  message: string,
  draft: Partial<RoofingDraft>
): OfflineFilterResult {
  const patch: Record<string, unknown> = {};
  const lower = message.toLowerCase();
  
  // Extract job type
  if (!draft.jobType) {
    if (lower.match(/\b(repair|fix|patch)\b/)) {
      patch.jobType = "repair";
    } else if (lower.match(/\b(replace|replacement|redo)\b/)) {
      patch.jobType = "replace";
    } else if (lower.match(/\b(new|new construction|new build)\b/)) {
      patch.jobType = "new";
    } else if (lower.match(/\b(insurance|claim)\b/)) {
      patch.jobType = "insurance";
    }
  }
  
  // Extract roof type
  if (!draft.roofType) {
    if (lower.match(/\b(shingle|shingles)\b/)) {
      patch.roofType = "shingle";
    } else if (lower.match(/\b(metal)\b/)) {
      patch.roofType = "metal";
    } else if (lower.match(/\b(tpo)\b/)) {
      patch.roofType = "flat_tpo";
    } else if (lower.match(/\b(epdm)\b/)) {
      patch.roofType = "flat_epdm";
    }
  }
  
  // Extract ZIP code (5 digits)
  if (!draft.addressZip) {
    const zipMatch = message.match(/\b(\d{5})\b/);
    if (zipMatch) {
      patch.addressZip = zipMatch[1];
    }
  }
  
  // Extract delivery preference
  if (!draft.delivery?.pickupOrDelivery && !draft.fulfillmentType) {
    if (lower.match(/\b(pickup|pick up|will pick|i'll pick)\b/)) {
      patch.fulfillmentType = "PICKUP";
      patch.delivery = { pickupOrDelivery: "pickup" };
    } else if (lower.match(/\b(delivery|deliver|ship|bring)\b/)) {
      patch.fulfillmentType = "DELIVERY";
      patch.delivery = { pickupOrDelivery: "delivery" };
    }
  }
  
  return { patch };
}






