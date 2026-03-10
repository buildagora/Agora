/**
 * RFQ Draft Canonicalization - Single Source of Truth
 * 
 * This module provides authoritative canonicalization for RFQ draft data.
 * All server endpoints that write thread.draft or RFQ-like draft data MUST use this module.
 * 
 * Server-safe module (no "use client")
 */

/**
 * Canonical draft keys - ONLY these keys are allowed in persisted drafts
 * State machine fields (mode, phase, progress, dispatch) are stored in state, not draft
 */
export const ALLOWED_DRAFT_KEYS = [
  "categoryId",
  "categoryLabel",
  "fulfillmentType",
  "needBy", // Canonical key (neededBy is alias, normalized to needBy)
  "deliveryAddress",
  "jobNameOrPo",
  "notes",
  "lineItems",
  "visibility",
  "targetSupplierIds",
  // Required intake slots (OSR-style conversation flow)
  "jobType",
  "roofType",
  // Note: conversationMode and all legacy dispatch keys are REMOVED (migrated to ThreadState)
  // They are now stored in state, not draft
] as const;

/**
 * Legacy key mappings (input only - never persisted)
 * Maps all known legacy/alias keys to canonical keys
 */
export const LEGACY_KEY_MAP: Record<string, string> = {
  requestedDate: "needBy",
  neededBy: "needBy", // neededBy is alias, needBy is canonical
  location: "deliveryAddress",
  address: "deliveryAddress",
  category: "categoryLabel",
  // Job type aliases
  job: "jobType",
  job_type: "jobType",
  // Roof type aliases
  roof: "roofType",
  roof_type: "roofType",
  // Also handle snake_case variants
  requested_date: "needBy",
  delivery_address: "deliveryAddress",
};

/**
 * Normalize lineItems to canonical shape
 * Ensures lineItems is an array of objects with description, quantity, unit
 */
function normalizeLineItems(value: unknown): any {
  if (!value) return undefined;
  
  // If already an array, validate and normalize each item
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "object" && item !== null) {
        return {
          description: item.description || item.desc || item.name || "",
          quantity: typeof item.quantity === "number" ? item.quantity : 
                   typeof item.quantity === "string" ? parseFloat(item.quantity) || 0 : 0,
          unit: item.unit || item.uom || "",
        };
      }
      // If item is a string, try to parse it
      if (typeof item === "string") {
        return {
          description: item,
          quantity: 0,
          unit: "",
        };
      }
      return {
        description: "",
        quantity: 0,
        unit: "",
      };
    }).filter((item) => item.description); // Remove empty items
  }
  
  // If it's a string, try to parse as JSON
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return normalizeLineItems(parsed);
      }
    } catch {
      // Not valid JSON, treat as single description
      return [{
        description: value,
        quantity: 0,
        unit: "",
      }];
    }
  }
  
  return undefined;
}

/**
 * Canonicalize draft patch - maps legacy keys to canonical, enforces whitelist
 * 
 * CRITICAL RULES:
 * - "needBy" is the canonical key (neededBy is normalized to needBy)
 * - Priority: needBy > neededBy > requestedDate > requested_date (if multiple present, prefer needBy)
 * - Unknown keys are dropped
 * - Empty/null/undefined values are omitted
 * - lineItems is normalized to canonical shape
 */
export function canonicalizeDraftPatch(
  patch: any,
  opts?: { threadId?: string; log?: boolean }
): Record<string, any> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {};
  }

  const normalizedPatch: Record<string, any> = {};
  const log = opts?.log ?? (process.env.NODE_ENV === "development");

  // Step 1: Handle needBy/neededBy/requestedDate priority
  // Priority: needBy > neededBy > requestedDate > requested_date (needBy is canonical)
  let needByValue: any = undefined;
  if (patch.needBy !== undefined && patch.needBy !== null && patch.needBy !== "") {
    needByValue = patch.needBy;
  } else if (patch.neededBy !== undefined && patch.neededBy !== null && patch.neededBy !== "") {
    needByValue = patch.neededBy;
  } else if (patch.requestedDate !== undefined && patch.requestedDate !== null && patch.requestedDate !== "") {
    needByValue = patch.requestedDate;
  } else if (patch.requested_date !== undefined && patch.requested_date !== null && patch.requested_date !== "") {
    needByValue = patch.requested_date;
  }
  
  if (needByValue !== undefined) {
    normalizedPatch.needBy = needByValue;
  }

  // Step 2: Process all other keys
  for (const key in patch) {
    // Skip needBy aliases (already handled above)
    if (key === "needBy" || key === "neededBy" || key === "requestedDate" || key === "requested_date") {
      continue;
    }

    // Map legacy keys to canonical
    const canonicalKey = LEGACY_KEY_MAP[key] || key;
    
    // Only include if it's an allowed canonical key
    if (ALLOWED_DRAFT_KEYS.includes(canonicalKey as any)) {
      let value = patch[key];
      
      // Normalize lineItems
      if (canonicalKey === "lineItems") {
        value = normalizeLineItems(value);
        if (value === undefined) {
          continue; // Skip if normalization failed
        }
      }
      
      // Skip empty values
      if (value === undefined || value === null || value === "") {
        continue;
      }
      
      normalizedPatch[canonicalKey] = value;
    } else if (log) {
      console.warn("[RFQ_DRAFT_CANONICAL] Stripped unknown key from patch", {
        key,
        threadId: opts?.threadId,
      });
    }
  }

  // Step 3: Dev-only regression test assertion
  if (log && (patch.neededBy !== undefined || patch.requestedDate !== undefined || patch.needBy !== undefined)) {
    // Assertion 1: normalizedPatch must NOT contain "neededBy" or "requestedDate" (only "needBy" is canonical)
    if (normalizedPatch.neededBy !== undefined || normalizedPatch.requestedDate !== undefined) {
      console.error("[RFQ_DRAFT_CANONICAL] REGRESSION: neededBy/requestedDate found in normalized output", {
        threadId: opts?.threadId,
        input: { needBy: patch.needBy, neededBy: patch.neededBy, requestedDate: patch.requestedDate },
        output: normalizedPatch,
      });
    }
    // Assertion 2: if input had needBy/neededBy/requestedDate, output must have needBy
    if ((patch.needBy || patch.neededBy || patch.requestedDate || patch.requested_date) && !normalizedPatch.needBy) {
      console.error("[RFQ_DRAFT_CANONICAL] REGRESSION: needBy missing from normalized output", {
        threadId: opts?.threadId,
        input: { needBy: patch.needBy, neededBy: patch.neededBy, requestedDate: patch.requestedDate },
        output: normalizedPatch,
      });
    }
    // Assertion 3: Priority rule test - if multiple present, prefer needBy > neededBy > requestedDate
    // Test case: { neededBy:"2026-03-01", requestedDate:"2026-03-02" } -> { needBy:"2026-03-01" }
    if (patch.neededBy && patch.requestedDate && !patch.needBy) {
      if (normalizedPatch.needBy !== patch.neededBy) {
        console.error("[RFQ_DRAFT_CANONICAL] REGRESSION: Priority rule violated (neededBy should win over requestedDate)", {
          threadId: opts?.threadId,
          input: { neededBy: patch.neededBy, requestedDate: patch.requestedDate },
          expected: { needBy: patch.neededBy },
          actual: normalizedPatch,
        });
      }
    }
  }

  return normalizedPatch;
}

/**
 * Validate fulfillmentType and deliveryAddress invariant
 * Returns error message if validation fails, null if valid
 */
export function validateFulfillmentInvariant(draft: any): { error: string; code: string } | null {
  const fulfillmentType = draft.fulfillmentType;
  const deliveryAddress = draft.deliveryAddress;
  
  // Normalize fulfillmentType
  const normalizedFulfillmentType = fulfillmentType 
    ? String(fulfillmentType).trim().toUpperCase() 
    : null;
  
  // Normalize deliveryAddress (trim whitespace, treat "" as null)
  const normalizedDeliveryAddress = deliveryAddress 
    ? String(deliveryAddress).trim() || null
    : null;
  
  // If fulfillmentType is DELIVERY, deliveryAddress must be non-empty
  if (normalizedFulfillmentType === "DELIVERY" && !normalizedDeliveryAddress) {
    return {
      error: "deliveryAddress is required when fulfillmentType is DELIVERY",
      code: "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED",
    };
  }
  
  return null;
}

/**
 * Apply normalized patch to draft and remove empty values
 * CRITICAL: Validates fulfillmentType/deliveryAddress invariant
 */
export function applyNormalizedPatch(draft: any, normalizedPatch: any): any {
  // Merge normalized patch into draft
  const merged = { ...draft, ...normalizedPatch };

  // Normalize deliveryAddress (trim whitespace, treat "" as null)
  if (merged.deliveryAddress !== undefined) {
    const addr = merged.deliveryAddress;
    if (addr === null || addr === undefined || (typeof addr === "string" && addr.trim() === "")) {
      delete merged.deliveryAddress;
    } else {
      merged.deliveryAddress = String(addr).trim();
    }
  }

  // Remove undefined/null/empty string values
  for (const key in merged) {
    const value = merged[key];
    if (value === undefined || value === null || (typeof value === "string" && value === "")) {
      delete merged[key];
    }
  }

  // CRITICAL: Validate fulfillmentType/deliveryAddress invariant
  // If DELIVERY without address, reject the change (keep previous fulfillmentType or set to null)
  const validationError = validateFulfillmentInvariant(merged);
  if (validationError) {
    // Reject DELIVERY if no address - keep previous fulfillmentType or remove it
    const previousFulfillmentType = draft.fulfillmentType;
    if (merged.fulfillmentType === "DELIVERY" || String(merged.fulfillmentType || "").toUpperCase() === "DELIVERY") {
      if (previousFulfillmentType && String(previousFulfillmentType).toUpperCase() !== "DELIVERY") {
        // Keep previous value
        merged.fulfillmentType = previousFulfillmentType;
      } else {
        // Remove fulfillmentType (will be set to PICKUP by default later)
        delete merged.fulfillmentType;
      }
    }
    
    // Log validation error in development
    if (process.env.NODE_ENV === "development") {
      console.warn("[RFQ_DRAFT_VALIDATION]", {
        error: validationError.error,
        code: validationError.code,
        fulfillmentType: merged.fulfillmentType,
        deliveryAddress: merged.deliveryAddress,
      });
    }
  }

  return merged;
}

