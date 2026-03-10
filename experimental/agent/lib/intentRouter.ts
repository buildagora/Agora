/**
 * ⚠️ NEUTERED - This file is no longer used for RFQ control flow
 * 
 * computeRfqStatus(draft) is the SINGLE AUTHORITY for:
 * - readiness
 * - next question selection
 * - dispatch eligibility
 * 
 * UTILITY FUNCTIONS ONLY - These are pure utilities, not RFQ control logic:
 */

import { detectTurnIntent } from "./turnIntent";
import { computeRfqStatus, type FieldId } from "./rfqStatus";
import { parseLineItemsFromText } from "./parseLineItems";
import { normalizeCategoryInput } from "../categories/normalizeCategory";
import { categoryIdToLabel, type CategoryId } from "../categoryIds";

/**
 * Simple hash function (djb2) for idempotency
 * Stable, fast, non-crypto hash
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract category from message text (utility only, not RFQ control)
 */
export function extractCategory(message: string): string | null {
  const { parseCategory } = require("./parse");
  return parseCategory(message);
}

/**
 * RouterDecision type for test compatibility
 */
export type RouterDecision = {
  mode: "RFQ_CREATE" | "ADVICE" | "SKIP";
  updatedDraft?: any;
  readyToDispatch?: boolean;
  missingSlots?: string[];
  nextQuestion?: string;
  idempotencyKey?: string;
  skippedAsDuplicate?: boolean;
  capabilityId?: string;
  reasons: string[];
};

/**
 * Parse date from message (supports "ASAP", "today", "tomorrow", M/D/YY, M/D/YYYY)
 */
function parseDateFromMessage(message: string): string | null {
  const lower = message.toLowerCase().trim();
  
  // "ASAP" or "today"
  if (lower === "asap" || lower === "today") {
    return "ASAP";
  }
  
  // "tomorrow" - compute using UTC
  if (lower === "tomorrow") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split("T")[0];
  }
  
  // M/D/YY or M/D/YYYY
  const dateMatch = message.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (dateMatch) {
    const [, month, day, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const monthPadded = month.padStart(2, "0");
    const dayPadded = day.padStart(2, "0");
    return `${fullYear}-${monthPadded}-${dayPadded}`;
  }
  
  return null;
}

/**
 * Extract delivery address from message
 * Pattern: /deliver to (.+)/i
 */
function extractDeliveryAddress(message: string): string | null {
  const deliverMatch = message.match(/deliver\s+to\s+(.+)/i);
  if (deliverMatch && deliverMatch[1]) {
    return deliverMatch[1].trim();
  }
  return null;
}

/**
 * Parse word numbers to integers (e.g., "one" => 1, "two" => 2)
 */
function parseWordNumber(word: string): number | null {
  const lower = word.toLowerCase().trim();
  const wordNumbers: Record<string, number> = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
  };
  return wordNumbers[lower] || null;
}

/**
 * Normalize unit to lowercase (especially "bundles" -> "bundles" or "bundle")
 * A) Null-safe: accept unknown/undefined and return undefined or "" safely
 */
function normalizeUnit(unit: unknown): string | undefined {
  // If unit is falsy, return undefined
  if (!unit) {
    return undefined;
  }
  // Coerce to string safely before calling .toLowerCase()
  const unitStr = String(unit);
  const lower = unitStr.toLowerCase().trim();
  // Specifically handle bundles
  if (lower === "bundles" || lower === "bundle") {
    return lower; // Return as-is (lowercase)
  }
  return lower;
}

/**
 * Normalize description for deduplication (lowercase, trim, remove leading "of ")
 */
function normalizeDescriptionForDedup(description: string): string {
  return description.toLowerCase().trim().replace(/^of\s+/, "");
}

/**
 * Deduplicate line items (5) - normalize description by lowercasing, trimming, removing leading "of "
 * B) Tolerate missing unit: do not assume unit exists
 */
function dedupeLineItems(items: Array<{ description: string; quantity: number; unit?: string | undefined }>): Array<{ description: string; quantity: number; unit?: string | undefined }> {
  const normalized: Array<{ description: string; quantity: number; unit?: string | undefined }> = [];
  const seen = new Map<string, number>();
  
  for (const item of items) {
    const normalizedDesc = normalizeDescriptionForDedup(item.description);
    // B) If unit is missing, default to "ea" for deduplication key, but keep it undefined in the item
    const normalizedUnit = normalizeUnit(item.unit) || "ea";
    const key = `${normalizedDesc}:${normalizedUnit}`;
    
    if (seen.has(key)) {
      // Merge quantities for duplicate items
      const idx = seen.get(key)!;
      normalized[idx].quantity += item.quantity;
    } else {
      // B) Keep unit as undefined if it was missing, don't default to "ea" in the item
      normalized.push({ ...item });
      seen.set(key, normalized.length - 1);
    }
  }
  
  return normalized;
}

/**
 * Parse line items with support for "and" and word numbers
 */
function parseLineItemsWithAnd(message: string): Array<{ description: string; quantity: number; unit?: string }> {
  const items: Array<{ description: string; quantity: number; unit?: string }> = [];
  
  // Split on "and" and commas
  const parts = message.split(/\s+(?:and|,)\s+/i);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Try to parse quantity (number or word)
    let quantity: number | null = null;
    let unit: string | undefined = undefined;
    let description = "";
    
    // Pattern 1: "100 bundles of shingles"
    let match = trimmed.match(/^(\d+)\s+(\w+)\s+of\s+(.+)$/i);
    if (match) {
      quantity = parseInt(match[1], 10);
      unit = normalizeUnit(match[2]) || undefined;
      description = match[3].trim();
    } else {
      // Pattern 2: "one box of nails"
      match = trimmed.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(\w+)\s+of\s+(.+)$/i);
      if (match) {
        const qtyStr = match[1];
        quantity = parseWordNumber(qtyStr) || parseInt(qtyStr, 10);
        unit = normalizeUnit(match[2]) || undefined;
        description = match[3].trim();
      } else {
        // Pattern 3: "100 bundles shingles" (no "of")
        match = trimmed.match(/^(\d+)\s+(\w+)\s+(.+)$/i);
        if (match) {
          quantity = parseInt(match[1], 10);
          unit = normalizeUnit(match[2]) || undefined;
          description = match[3].trim();
        } else {
          // Pattern 4: "one box nails" (no "of")
          match = trimmed.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(\w+)\s+(.+)$/i);
          if (match) {
            const qtyStr = match[1];
            quantity = parseWordNumber(qtyStr) || parseInt(qtyStr, 10);
            unit = normalizeUnit(match[2]) || undefined;
            description = match[3].trim();
          }
        }
      }
    }
    
    if (quantity && description) {
      items.push({ description, quantity, unit });
    }
  }
  
  // If no items found with "and" parsing, fall back to existing parser
  if (items.length === 0) {
    return parseLineItemsFromText(message);
  }
  
  return items;
}

/**
 * Get question text for a field based on router priority
 */
function getQuestionForRouterSlot(slotId: string | null): string {
  if (!slotId) return "";
  
  switch (slotId) {
    case "categoryId":
      return "What category of materials do you need?";
    case "lineItems":
      return "What materials, quantities, and units do you need? (e.g., 10 bundles of shingles)";
    case "fulfillmentType":
      return "Pickup or delivery?";
    case "needBy":
      return "When do you need this by? (You can say 'ASAP', 'tomorrow', or a date like 2/20/2026)";
    case "jobNameOrPo":
      return "What should I label it as?";
    case "deliveryAddress":
      return "What's the delivery address?";
    default:
      return "What else do you need?";
  }
}

/**
 * Check if a value is a yes/no response
 */
function isYesNoResponse(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /^(yes|no|yep|nope|yeah|nah|yup|ok|okay|sure)$/i.test(lower);
}

/**
 * Check if message has procurement intent (quantity+material OR verbs like need/order/quote/price/buy/send)
 */
function hasProcurementIntent(message: string): boolean {
  const lower = message.toLowerCase();
  
  // Quantity + material pattern
  const quantityMaterialPattern = /\b\d+\s+(?:bundles?|squares?|sheets?|pieces?|pcs?|boxes?|bags?|ft|feet|lf|linear\s+feet?)\s+(?:of\s+)?(?:shingles?|osb|plywood|drywall|insulation|siding|lumber|boards?|materials?|nails?|screws?)/i;
  if (quantityMaterialPattern.test(message)) {
    return true;
  }
  
  // Procurement verbs
  const procurementVerbs = /\b(need|order|quote|price|pricing|buy|purchase|send|get)\s+(?:me|this|a|an|for|pricing|quotes?|order)/i;
  if (procurementVerbs.test(message)) {
    return true;
  }
  
  return false;
}

/**
 * Check if message is an info question
 */
function isInfoQuestion(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.includes("?") || /^(how|what|why)/i.test(trimmed);
}

/**
 * routeIntent function - deterministic routing and extraction
 */
export function routeIntent(input: {
  threadId: string;
  userMessage: string;
  currentDraft?: any;
}): RouterDecision {
  const { threadId, userMessage, currentDraft = {} } = input;
  
  // 2) Create a local reasons array
  const reasons: string[] = [];
  
  // Build draft patch starting from current draft
  const draftPatch: any = { ...currentDraft };
  // 3) Always ensure lineItems is an array (prevent .some crashes)
  if (!Array.isArray(draftPatch.lineItems)) {
    draftPatch.lineItems = [];
  }
  const lastAskedSlot = (currentDraft as any).__lastAskedSlot;
  
  // Track if we extracted any RFQ fields (for mode determination)
  let extractedRfqFields = false;
  
  // Track if jobNameOrPo yes/no follow-up occurred (for special handling)
  let jobNameOrPoYesNoFollowUp = false;
  
  // A) Handle follow-ups via __lastAskedSlot
  let handledFollowUp = false;
  
  if (lastAskedSlot === "jobNameOrPo") {
    if (isYesNoResponse(userMessage)) {
      // 2) DO NOT set jobNameOrPo for yes/no responses
      // Keep it missing so nextQuestion will ask for it
      jobNameOrPoYesNoFollowUp = true;
    } else {
      draftPatch.jobNameOrPo = userMessage.trim();
      extractedRfqFields = true;
    }
    handledFollowUp = true;
  } else if (lastAskedSlot === "categoryId") {
    // 3) Push reason for categoryId follow-up
    reasons.push("slot-answer:categoryId");
    // Extract category from message
    const categoryResult = normalizeCategoryInput(userMessage);
    if (categoryResult.categoryId) {
      draftPatch.categoryId = categoryResult.categoryId;
      extractedRfqFields = true;
    } else {
      // Fallback keyword matching
      const lower = userMessage.toLowerCase();
      if (lower.includes("mechanical") || lower.includes("hvac") || lower.includes("a/c") || lower.includes("ac")) {
        draftPatch.categoryId = "hvac";
        extractedRfqFields = true;
      } else if (lower.includes("roof") || lower.includes("shingle")) {
        draftPatch.categoryId = "roofing";
        extractedRfqFields = true;
      } else if (lower.includes("rofing")) {
        draftPatch.categoryId = "roofing"; // typo fix
        extractedRfqFields = true;
      }
    }
    // DO NOT create lineItems/jobNameOrPo when following up on categoryId
    // 1) Preserve lineItems from currentDraft (even if empty)
    draftPatch.lineItems = Array.isArray(currentDraft.lineItems) ? currentDraft.lineItems : [];
    handledFollowUp = true;
  } else if (lastAskedSlot === "fulfillmentType") {
    // 3) Push reason for fulfillmentType follow-up
    reasons.push("slot-answer:fulfillmentType");
    const lower = userMessage.toLowerCase().trim();
    if (lower === "pickup" || lower === "pick up") {
      draftPatch.fulfillmentType = "PICKUP";
      extractedRfqFields = true;
    } else if (lower === "delivery" || lower === "deliver") {
      draftPatch.fulfillmentType = "DELIVERY";
      extractedRfqFields = true;
    }
    // DO NOT extract other fields when following up on fulfillmentType
    // 2) Preserve lineItems from currentDraft (even if empty)
    draftPatch.lineItems = Array.isArray(currentDraft.lineItems) ? currentDraft.lineItems : [];
    handledFollowUp = true;
  } else if (lastAskedSlot === "lineItems") {
    const trimmed = userMessage.trim();
    if (/^\d+$/.test(trimmed)) {
      // Just a number: update last item quantity
      if (Array.isArray(draftPatch.lineItems) && draftPatch.lineItems.length > 0) {
        const lastItem = draftPatch.lineItems[draftPatch.lineItems.length - 1];
        lastItem.quantity = parseInt(trimmed, 10);
        extractedRfqFields = true;
      }
    } else {
      // Contains items: parse and merge
      const parsedItems = parseLineItemsWithAnd(userMessage);
      if (parsedItems.length > 0) {
        const existing = Array.isArray(draftPatch.lineItems) ? draftPatch.lineItems : [];
        const merged = [...existing, ...parsedItems];
        // 5) Dedupe with improved normalization
        draftPatch.lineItems = dedupeLineItems(merged);
        extractedRfqFields = true;
      }
    }
    handledFollowUp = true;
  } else if (lastAskedSlot === "needBy" || lastAskedSlot === "neededBy") {
    const parsedDate = parseDateFromMessage(userMessage);
    if (parsedDate) {
      draftPatch.needBy = parsedDate;
      extractedRfqFields = true;
    }
    handledFollowUp = true;
  }
  
  // Only extract other fields if NOT handling a follow-up
  if (!handledFollowUp) {
    // No follow-up: extract all fields from message
    
    // Extract categoryId if missing
    if (!draftPatch.categoryId) {
      const categoryResult = normalizeCategoryInput(userMessage);
      if (categoryResult.categoryId) {
        draftPatch.categoryId = categoryResult.categoryId;
        extractedRfqFields = true;
      } else {
        const lower = userMessage.toLowerCase();
        if (lower.includes("mechanical") || lower.includes("hvac") || lower.includes("a/c") || lower.includes("ac")) {
          draftPatch.categoryId = "hvac";
          extractedRfqFields = true;
        } else if (lower.includes("roof") || lower.includes("shingle")) {
          draftPatch.categoryId = "roofing";
          extractedRfqFields = true;
        } else if (lower.includes("rofing")) {
          draftPatch.categoryId = "roofing"; // typo fix
          extractedRfqFields = true;
        }
      }
    }
    
    // Extract lineItems (skip generic phrases)
    const lowerMsg = userMessage.toLowerCase().trim();
    const isGenericPhrase = lowerMsg === "i need materials" || 
                            lowerMsg === "materials" ||
                            lowerMsg === "i need roofing materials" ||
                            lowerMsg.match(/^i\s+need\s+\w+\s+materials?$/);
    if (!isGenericPhrase) {
      const parsedItems = parseLineItemsWithAnd(userMessage);
      if (parsedItems.length > 0) {
        const existing = Array.isArray(draftPatch.lineItems) ? draftPatch.lineItems : [];
        const merged = [...existing, ...parsedItems];
        // 5) Dedupe with improved normalization
        draftPatch.lineItems = dedupeLineItems(merged);
        extractedRfqFields = true;
      }
    }
    
    // Extract fulfillmentType
    const lower = userMessage.toLowerCase();
    if (lower.includes("pickup") || lower.includes("pick up")) {
      draftPatch.fulfillmentType = "PICKUP";
      extractedRfqFields = true;
    } else if (lower.includes("deliver") || lower.includes("delivery")) {
      draftPatch.fulfillmentType = "DELIVERY";
      extractedRfqFields = true;
    }
    
    // Extract deliveryAddress (only if DELIVERY)
    if (draftPatch.fulfillmentType === "DELIVERY") {
      const addr = extractDeliveryAddress(userMessage);
      if (addr) {
        draftPatch.deliveryAddress = addr;
        extractedRfqFields = true;
      }
    }
    
    // Extract jobNameOrPo
    const jobMatch = userMessage.match(/(?:job\s+name\s+is|po\s+is|po\s+number\s+is|po#\s+is)\s+(.+)/i);
    if (jobMatch && jobMatch[1]) {
      draftPatch.jobNameOrPo = jobMatch[1].trim();
      extractedRfqFields = true;
    }
    
    // Extract needBy
    const parsedDate = parseDateFromMessage(userMessage);
    if (parsedDate) {
      draftPatch.needBy = parsedDate;
      extractedRfqFields = true;
    }
    
    // Extract priority
    if (lower.includes("urgent")) {
      draftPatch.priority = "urgent";
      extractedRfqFields = true;
    }
  }
  
  // Determine intent using detectTurnIntent
  const threadState = { mode: currentDraft?.conversationMode === "procurement" ? "PROCUREMENT" : "ADVICE" };
  const intent = detectTurnIntent({
    message: userMessage,
    draft: draftPatch,
    threadState,
    conversationMode: threadState.mode === "PROCUREMENT" ? "procurement" : "advice",
  });
  
  // 1) Check procurement intent
  const procurementIntent = hasProcurementIntent(userMessage);
  const isInfoQ = isInfoQuestion(userMessage);
  
  // 1) Mode selection: Only set mode="RFQ_CREATE" if:
  // a) procurement intent is true OR
  // b) currentDraft.__lastAskedSlot is set OR
  // c) you extracted ANY RFQ fields AND the message is NOT an info question
  // If message is an info question AND no lastAskedSlot AND no procurement intent => mode MUST be "ADVICE"
  const mode: "RFQ_CREATE" | "ADVICE" | "SKIP" = 
    intent === "DECLINE"
      ? "SKIP"
      : (procurementIntent || lastAskedSlot || (extractedRfqFields && !isInfoQ))
      ? "RFQ_CREATE"
      : (isInfoQ && !lastAskedSlot && !procurementIntent)
      ? "ADVICE"
      : intent === "PROCURE" || intent === "PROCUREMENT" || intent === "CONFIRM" || extractedRfqFields
      ? "RFQ_CREATE"
      : "ADVICE";
  
  // B) Compute routerMissingSlots in priority order
  const routerMissingSlots: string[] = [];
  
  // 1) categoryId (if missing)
  if (!draftPatch.categoryId) {
    routerMissingSlots.push("categoryId");
  }
  
  // 2) lineItems (if missing OR empty)
  if (!Array.isArray(draftPatch.lineItems) || draftPatch.lineItems.length === 0) {
    routerMissingSlots.push("lineItems");
  }
  
  // 3) fulfillmentType (if missing)
  if (!draftPatch.fulfillmentType) {
    routerMissingSlots.push("fulfillmentType");
  }
  
  // 4) needBy (if missing)
  if (!draftPatch.needBy) {
    routerMissingSlots.push("needBy");
  }
  
  // 5) jobNameOrPo (if missing)
  // 2) If jobNameOrPo yes/no follow-up occurred, force it to be missing
  if (jobNameOrPoYesNoFollowUp || !draftPatch.jobNameOrPo || typeof draftPatch.jobNameOrPo !== "string" || draftPatch.jobNameOrPo.trim().length === 0) {
    routerMissingSlots.push("jobNameOrPo");
  }
  
  // 6) deliveryAddress (only if fulfillmentType==="DELIVERY" and missing)
  if (draftPatch.fulfillmentType === "DELIVERY" && (!draftPatch.deliveryAddress || typeof draftPatch.deliveryAddress !== "string" || draftPatch.deliveryAddress.trim().length === 0)) {
    routerMissingSlots.push("deliveryAddress");
  }
  
  // D) readyToDispatch based on routerMissingSlots
  const readyToDispatch = routerMissingSlots.length === 0;
  
  // Get next question based on FIRST missing slot
  // 2) If jobNameOrPo yes/no follow-up, force nextQuestion to include "What should I label it as"
  let nextQuestion = getQuestionForRouterSlot(routerMissingSlots[0] || null);
  if (jobNameOrPoYesNoFollowUp) {
    // Force nextQuestion to ask for jobNameOrPo with exact phrase
    nextQuestion = "What should I label it as?";
    // 2) Do NOT advance to needBy even if needBy is missing - jobNameOrPo takes priority
    // This is already handled by routerMissingSlots priority order (jobNameOrPo comes before needBy)
  }
  
  // D) Determine capabilityId
  // 1) If message is an info question AND no lastAskedSlot AND no procurement intent => capabilityId MUST be "cap.advice_mode.v1"
  let capabilityId: string | undefined;
  if (readyToDispatch) {
    capabilityId = "cap.dispatch_rfq.v1";
  } else if (mode === "ADVICE" || (isInfoQ && !lastAskedSlot && !procurementIntent)) {
    capabilityId = "cap.advice_mode.v1";
  }
  
  // Generate idempotency key
  const idempotencyKey = hashString(`${threadId}:${userMessage}`);
  
  // C) ALWAYS return updatedDraft.lineItems as an array in ALL branches
  // At the end of routeIntent (before return), ensure lineItems is always an array
  draftPatch.lineItems = Array.isArray(draftPatch.lineItems) ? draftPatch.lineItems : [];
  
  // 4) Ensure reasons is always an array (even if empty)
  const finalReasons: string[] = Array.isArray(reasons) ? reasons : [];
  
  return {
    mode,
    updatedDraft: draftPatch,
    readyToDispatch,
    missingSlots: routerMissingSlots, // B) Return routerMissingSlots, NOT computeRfqStatus.missingRequired
    nextQuestion,
    idempotencyKey,
    skippedAsDuplicate: false,
    capabilityId,
    reasons: finalReasons, // 4) Include reasons in return
  };
}
