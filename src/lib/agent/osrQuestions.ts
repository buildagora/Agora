/**
 * OSR-Style Question Selection (V1 Roofing)
 * Real Outside Sales Rep conversation flow - leads the conversation, doesn't ask generic questions
 */

export interface OSRDraft {
  category?: string;
  jobType?: "repair" | "replace" | "new" | "insurance";
  roofType?: "shingle" | "metal" | "flat_tpo" | "flat_epdm" | "modified_bitumen" | "other";
  addressZip?: string | null;
  roofSize?: { squares?: number; sqft?: number };
  delivery?: { pickupOrDelivery?: "pickup" | "delivery" | null };
  timeline?: { needByDate?: string | null; urgency?: "rush" | "standard" | null };
  lineItems?: Array<{ description: string; quantity: number; unit?: string }>;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  neededBy?: string;
  jobNameOrPo?: string;
  __resolvedSlots?: string[] | Set<string>; // Track which slots are locked/resolved
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
 * Build memory-implied prefix based on what we already know
 * Uses phrases like "Based on what you told me..." to show memory
 */
function buildMemoryPrefix(draft: Partial<OSRDraft>): string {
  const known: string[] = [];
  
  if (draft.jobType) {
    const jobTypeLabel = draft.jobType === "repair" ? "repair" : 
                        draft.jobType === "replace" ? "replacement" :
                        draft.jobType === "new" ? "new construction" :
                        draft.jobType === "insurance" ? "insurance job" : draft.jobType;
    known.push(jobTypeLabel);
  }
  
  if (draft.roofType) {
    const roofTypeLabel = draft.roofType === "shingle" ? "shingle roof" :
                         draft.roofType === "metal" ? "metal roof" :
                         draft.roofType === "flat_tpo" ? "TPO roof" :
                         draft.roofType === "flat_epdm" ? "EPDM roof" : draft.roofType;
    known.push(roofTypeLabel);
  }
  
  if (draft.roofSize) {
    const size = draft.roofSize.squares ? `${draft.roofSize.squares} squares` :
                 draft.roofSize.sqft ? `${draft.roofSize.sqft} sq ft` : null;
    if (size) known.push(size);
  }
  
  if (known.length > 0) {
    return `Based on what you told me — ${known.join(", ")} — `;
  }
  
  // If we have any context at all, use a lighter memory reference
  if (draft.category || draft.jobNameOrPo || draft.lineItems?.length) {
    return "So far I've got some details. ";
  }
  
  return "";
}

/**
 * Map OSR slot names to canonical SlotKey names for resolution tracking
 */
function mapOSRSlotToCanonical(slot: string): string {
  const mapping: Record<string, string> = {
    jobType: "categoryId", // jobType is category-level info
    roofType: "categoryId", // roofType is category-level info
    category: "categoryId",
    delivery: "fulfillmentType",
    fulfillmentType: "fulfillmentType",
    addressZip: "deliveryAddress",
    deliveryAddress: "deliveryAddress",
    lineItems: "lineItems",
    neededBy: "needBy",
    needBy: "needBy",
    timeline: "needBy",
    jobNameOrPo: "jobNameOrPo",
  };
  return mapping[slot] || slot;
}

/**
 * Check if a slot is resolved (locked)
 */
function isSlotResolved(draft: Partial<OSRDraft>, slot: string): boolean {
  const resolvedSlots = getResolvedSlotsOSR(draft);
  const canonicalSlot = mapOSRSlotToCanonical(slot);
  return resolvedSlots.has(slot) || resolvedSlots.has(canonicalSlot);
}

/**
 * Determine if this is the first turn (empty draft)
 */
function isFirstTurn(draft: Partial<OSRDraft>): boolean {
  return (
    !draft.category &&
    !draft.jobType &&
    !draft.roofType &&
    !draft.roofSize &&
    !draft.addressZip &&
    !draft.delivery?.pickupOrDelivery &&
    !draft.lineItems?.length
  );
}

/**
 * Get opening question for first turn
 * OSR-style: leads the conversation, doesn't ask generic questions
 * Uses memory-implied language and natural acknowledgments
 */
function getOpeningQuestion(message: string): string {
  const lower = message.toLowerCase();
  
  // If user mentions roofing keywords, acknowledge and narrow
  if (lower.match(/\b(roof|roofing|shingle|metal|tpo|epdm)\b/)) {
    return "Got it — roofing job. What kind of work are we looking at — repair, replacement, or new construction?";
  }
  
  // If user mentions insurance/claim, acknowledge and confirm
  if (lower.match(/\b(insurance|claim|hail|storm|wind damage)\b/)) {
    return "Sounds like an insurance job. What type of roof are we working with — shingle, metal, or flat?";
  }
  
  // Default opening: acknowledge and ask naturally
  return "What kind of job are you working on?";
}

/**
 * Check if a slot has a confirmed value (has value AND is resolved)
 * PHASE 1 RULE: Never ask about slots that are both filled and confirmed
 */
function isSlotConfirmed(draft: Partial<OSRDraft>, slot: string): boolean {
  // Check if slot has a value
  const hasValue = (() => {
    switch (slot) {
      case "jobNameOrPo":
        return !!draft.jobNameOrPo;
      case "lineItems":
        return Array.isArray(draft.lineItems) && draft.lineItems.length > 0;
      case "neededBy":
      case "needBy":
        return !!(draft.neededBy || draft.timeline?.needByDate);
      case "jobType":
        return !!draft.jobType;
      case "roofType":
        return !!draft.roofType;
      case "roofSize":
        return !!(draft.roofSize?.squares || draft.roofSize?.sqft);
      case "addressZip":
      case "deliveryAddress":
        return !!draft.addressZip;
      case "delivery":
      case "fulfillmentType":
        return !!(draft.delivery?.pickupOrDelivery || draft.fulfillmentType);
      default:
        return false;
    }
  })();
  
  // Slot is confirmed if it has a value AND is resolved
  return hasValue && isSlotResolved(draft, slot);
}

/**
 * Get next OSR-style question based on missing fields
 * Priority order matches real OSR intake flow
 * 
 * PHASE 1 RULES:
 * 1. Never ask about confirmed slots (has value AND is resolved)
 * 2. Never ask about slots that have values (even if not resolved, user already provided it)
 * 3. Only ask for the NEXT missing piece, not all missing pieces
 * 4. Never restate known facts in questions
 */
export function getOSRQuestion(
  draft: Partial<OSRDraft>,
  lastAskedSlot?: string
): { question: string; slot: string } {
  // First turn: opening question (only if jobType not confirmed)
  if (isFirstTurn(draft) && !isSlotConfirmed(draft, "jobType")) {
    return {
      question: getOpeningQuestion(""),
      slot: "jobType",
    };
  }

  // Priority order for OSR intake (conversational flow)
  // Prioritizes validation contract fields (jobNameOrPo, lineItems, neededBy)
  // but maintains OSR-style conversational flow
  // CRITICAL: Check confirmed slots before asking (PHASE 1: already confirmed guard)
  
  // Build memory-implied prefix based on what we already know
  const memoryPrefix = buildMemoryPrefix(draft);
  
  // PHASE 1 RULE: "Already confirmed" guard - never ask about slots that have values
  // Priority order: validation contract fields first, then context fields
  
  // 1. Job name/PO - required by validation contract (ask early for context)
  // PHASE 1: Check if already confirmed (has value AND resolved) OR has value (user already provided)
  if (!isSlotConfirmed(draft, "jobNameOrPo") && !draft.jobNameOrPo && lastAskedSlot !== "jobNameOrPo" && !isSlotResolved(draft, "jobNameOrPo")) {
    return {
      question: `${memoryPrefix}What's the job name or PO number?`,
      slot: "jobNameOrPo",
    };
  }
  
  // If we just asked for jobNameOrPo and still don't have it, rephrase once
  if (!draft.jobNameOrPo && lastAskedSlot === "jobNameOrPo" && !isSlotResolved(draft, "jobNameOrPo")) {
    return {
      question: `${memoryPrefix}If you don't have a PO yet, you can say "no PO" and we'll proceed. Otherwise, what's the job name or PO number?`,
      slot: "jobNameOrPo",
    };
  }

  // 2. Line items - specific materials (required by validation contract, most important)
  // PHASE 1: Check if already confirmed OR has value
  const hasLineItems = Array.isArray(draft.lineItems) && draft.lineItems.length > 0;
  if (!isSlotConfirmed(draft, "lineItems") && !hasLineItems && !isSlotResolved(draft, "lineItems")) {
    if (lastAskedSlot !== "lineItems") {
      // If we have roof type and size, be more specific (but don't restate them - PHASE 1 rule)
      if (draft.roofType && draft.roofSize) {
        const roofTypeLabel = draft.roofType === "shingle" ? "shingles" : 
                             draft.roofType === "metal" ? "metal panels" :
                             draft.roofType === "flat_tpo" ? "TPO membrane" :
                             draft.roofType === "flat_epdm" ? "EPDM membrane" : "materials";
        return {
          question: `${memoryPrefix}What specific ${roofTypeLabel} and accessories do you need? Include quantities.`,
          slot: "lineItems",
        };
      }
      return {
        question: `${memoryPrefix}What materials do you need? Include quantities and units (e.g., '30 squares shingles' or '10 bundles').`,
        slot: "lineItems",
      };
    }
  }

  // 3. Timeline/neededBy - when needed (required by validation contract)
  // PHASE 1: Check if already confirmed OR has value
  const hasNeededBy = !!(draft.neededBy || draft.timeline?.needByDate);
  if (!isSlotConfirmed(draft, "neededBy") && !hasNeededBy && lastAskedSlot !== "timeline" && lastAskedSlot !== "neededBy" && !isSlotResolved(draft, "neededBy")) {
    return {
      question: `${memoryPrefix}When do you need the materials by?`,
      slot: "neededBy",
    };
  }

  // Optional context fields (for better OSR experience, but not blocking)
  // 4. Job type (repair/replace/new/insurance) - establishes context
  // PHASE 1: Check if already confirmed OR has value
  if (!isSlotConfirmed(draft, "jobType") && !draft.jobType && lastAskedSlot !== "jobType" && !isSlotResolved(draft, "jobType")) {
    return {
      question: `${memoryPrefix}What kind of work are we looking at — repair, replacement, or new construction?`,
      slot: "jobType",
    };
  }

  // 5. Roof type - narrows material options
  // PHASE 1: Check if already confirmed OR has value
  if (!isSlotConfirmed(draft, "roofType") && !draft.roofType && lastAskedSlot !== "roofType" && !isSlotResolved(draft, "roofType")) {
    return {
      question: `${memoryPrefix}What type of roof are we working with — shingle, metal, TPO, EPDM, or something else?`,
      slot: "roofType",
    };
  }

  // 6. Size - critical for pricing
  // PHASE 1: Check if already confirmed OR has value
  const hasRoofSize = !!(draft.roofSize?.squares || draft.roofSize?.sqft);
  if (!isSlotConfirmed(draft, "roofSize") && !hasRoofSize && !isSlotResolved(draft, "roofSize")) {
    if (lastAskedSlot !== "roofSize") {
      return {
        question: `${memoryPrefix}What size are we looking at? Squares or square feet?`,
        slot: "roofSize",
      };
    }
  }

  // 7. Location (ZIP) - needed for delivery/routing
  // PHASE 1: Check if already confirmed OR has value
  if (!isSlotConfirmed(draft, "addressZip") && !draft.addressZip && lastAskedSlot !== "addressZip" && !isSlotResolved(draft, "addressZip")) {
    return {
      question: `${memoryPrefix}What's the ZIP code for the job site?`,
      slot: "addressZip",
    };
  }

  // 8. Delivery method - pickup vs delivery
  // PHASE 1: Check if already confirmed OR has value
  const hasFulfillment = !!(draft.delivery?.pickupOrDelivery || draft.fulfillmentType);
  if (!isSlotConfirmed(draft, "fulfillmentType") && !hasFulfillment && lastAskedSlot !== "delivery" && lastAskedSlot !== "fulfillmentType" && !isSlotResolved(draft, "delivery") && !isSlotResolved(draft, "fulfillmentType")) {
    return {
      question: `${memoryPrefix}Do you need delivery to the job site, or will you pick up?`,
      slot: "fulfillmentType",
    };
  }

  // All required fields filled - this shouldn't be reached if validation is correct
  return {
    question: `${memoryPrefix}Perfect! Once I understand the scope, I'll make sure materials and pricing line up. Want me to get pricing on this?`,
    slot: "",
  };
}

/**
 * Get conversational acknowledgment when user provides information
 */
export function getAcknowledgment(
  slot: string,
  value: any,
  draft: Partial<OSRDraft>
): string {
  if (!value) {
    return "";
  }
  
  switch (slot) {
    case "jobType":
      const jobTypeLabel = value === "insurance" ? "insurance job" : 
                          value === "repair" ? "repair" :
                          value === "replace" ? "replacement" :
                          value === "new" ? "new construction" : value;
      return `Got it — ${jobTypeLabel}.`;
    case "roofType":
      const roofTypeLabel = value === "shingle" ? "shingle roof" : 
                           value === "metal" ? "metal roof" : value;
      return `Perfect — ${roofTypeLabel}.`;
    case "roofSize":
      if (typeof value === "object" && value !== null) {
        const size = (value as any).squares ? `${(value as any).squares} squares` : 
                     (value as any).sqft ? `${(value as any).sqft} sq ft` : "";
        return size ? `Okay, ${size}.` : "";
      }
      return "";
    case "addressZip":
      return `Got it — ZIP ${value}.`;
    case "delivery":
      const deliveryVal = typeof value === "object" && value !== null 
        ? (value as any).pickupOrDelivery 
        : value;
      if (deliveryVal === "pickup" || deliveryVal === "PICKUP") {
        return "Pickup, got it.";
      } else if (deliveryVal === "delivery" || deliveryVal === "DELIVERY") {
        return "Delivery to the job site, perfect.";
      }
      return "";
    case "fulfillmentType":
      if (value === "PICKUP" || value === "pickup") {
        return "Pickup, got it.";
      } else if (value === "DELIVERY" || value === "delivery") {
        return "Delivery to the job site, perfect.";
      }
      return "";
    case "timeline":
      const timelineVal = typeof value === "object" && value !== null 
        ? (value as any).needByDate 
        : value;
      return timelineVal ? `Need it by ${timelineVal}, understood.` : "";
    case "neededBy":
    case "needBy":
      return value ? `Need it by ${value}, understood.` : "";
    case "lineItems":
      return Array.isArray(value) && value.length > 0 ? "Got the materials." : "";
    case "jobNameOrPo":
      return value ? `Job name "${value}", got it.` : "";
    default:
      return "";
  }
}

