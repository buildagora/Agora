/**
 * Agent Intent Router V1
 * Deterministic intent routing for buyer chat input
 */

import type { CategoryId } from "../categoryIds";
import { normalizeCategoryInput, CATEGORY_LABELS, categoryIdToLabel } from "../categoryDisplay";
import type { AgentDraftRFQ, AgentLineItem, AgentPriority, FulfillmentType } from "./contracts";
import { validateAgentDraftRFQ } from "./contracts";
import type { CapabilityId } from "./capabilities";

/**
 * Intent mode for routing
 */
export type IntentMode = "ADVICE" | "RFQ_CREATE" | "RFQ_UPDATE" | "UNKNOWN";

/**
 * Slot keys that can be extracted from user input
 */
export type SlotKey =
  | "jobNameOrPo"
  | "categoryId"
  | "fulfillmentType"
  | "deliveryAddress"
  | "lineItems"
  | "priority"
  | "needBy";

/**
 * Router decision result
 */
export interface RouterDecision {
  mode: IntentMode;
  capabilityId: CapabilityId;
  updatedDraft?: Partial<AgentDraftRFQ>;
  missingSlots: SlotKey[];
  nextQuestion?: string; // exactly one question if missing slots
  readyToDispatch: boolean; // true only when validateAgentDraftRFQ would pass
  confidence: "high" | "medium" | "low";
  reasons: string[]; // short internal reasons (NOT for UI)
  idempotencyKey: string; // stable hash of (threadId + lastUserMsg + draftSignature)
  acknowledgment?: string; // acknowledgment message for corrections or slot fills
}

/**
 * Extended draft type with router-only metadata
 */
interface RouterDraft extends Partial<AgentDraftRFQ> {
  __lastAskedSlot?: SlotKey;
  __resolvedSlots?: Set<SlotKey> | SlotKey[]; // Track which slots are locked/resolved
}

/**
 * Simple hash function (djb2) for idempotency key
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate idempotency key from threadId, userMessage, and draft signature
 */
export function generateIdempotencyKey(
  threadId: string,
  userMessage: string,
  draft: Partial<AgentDraftRFQ>
): string {
  const sortedDraftKeys = Object.keys(draft)
    .filter((k) => k !== "__lastAskedSlot")
    .sort()
    .map((k) => `${k}:${JSON.stringify((draft as any)[k])}`)
    .join("|");
  
  const signature = `${threadId}|${userMessage.trim()}|${sortedDraftKeys}`;
  return hashString(signature);
}

/**
 * Parse spelled numbers (zero to twenty) to numeric
 */
function parseSpelledNumber(text: string): number | null {
  const spelled: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };
  
  const lower = text.toLowerCase().trim();
  if (spelled[lower]) {
    return spelled[lower];
  }
  
  // Try to parse as numeric
  const num = parseInt(text, 10);
  if (!isNaN(num) && num >= 0) {
    return num;
  }
  
  return null;
}

/**
 * Extract category from message
 */
function extractCategory(message: string): CategoryId | null {
  const result = normalizeCategoryInput(message);
  if (result.categoryId) {
    return result.categoryId;
  }
  
  // Fallback: check for material keywords that imply category
  const lower = message.toLowerCase();
  
  // Roofing keywords (expanded for better inference)
  if (
    lower.includes("shingle") ||
    lower.includes("roof") ||
    lower.includes("roofing") ||
    lower.includes("felt") ||
    lower.includes("underlayment") ||
    lower.includes("drip edge") ||
    lower.includes("ridge vent") ||
    lower.includes("flashing") ||
    lower.includes("cap nail")
  ) {
    return "roofing";
  }
  
  // HVAC keywords
  if (
    lower.includes("hvac") ||
    lower.includes("heating") ||
    lower.includes("cooling") ||
    lower.includes("air conditioning") ||
    lower.includes("furnace") ||
    lower.includes("duct")
  ) {
    return "hvac";
  }
  
  // Plumbing keywords
  if (
    lower.includes("plumb") ||
    lower.includes("pipe") ||
    lower.includes("faucet") ||
    lower.includes("toilet") ||
    lower.includes("sink")
  ) {
    return "plumbing";
  }
  
  // Electrical keywords
  if (
    lower.includes("electr") ||
    lower.includes("wire") ||
    lower.includes("outlet") ||
    lower.includes("switch") ||
    lower.includes("breaker")
  ) {
    return "electrical";
  }
  
  // Lumber/Siding keywords
  if (
    lower.includes("lumber") ||
    lower.includes("siding") ||
    lower.includes("board") ||
    lower.includes("2x4") ||
    lower.includes("plywood")
  ) {
    return "lumber_siding";
  }
  
  return null;
}

/**
 * Extract fulfillment type from message
 */
function extractFulfillmentType(message: string): FulfillmentType | null {
  const lower = message.toLowerCase();
  
  if (
    lower.includes("deliver") ||
    lower.includes("delivery") ||
    lower.includes("drop off") ||
    lower.includes("ship") ||
    lower.includes("shipping")
  ) {
    return "DELIVERY";
  }
  
  if (
    lower.includes("pickup") ||
    lower.includes("pick up") ||
    lower.includes("will pick up") ||
    lower.includes("will-call") ||
    lower.includes("will call")
  ) {
    return "PICKUP";
  }
  
  return null;
}

/**
 * Extract priority from message
 */
function extractPriority(message: string): AgentPriority {
  const lower = message.toLowerCase();
  
  if (
    lower.includes("preferred") ||
    lower.includes("only send to") ||
    lower.includes("just send to") ||
    lower.includes("only to")
  ) {
    return "preferred_only";
  }
  
  if (
    lower.includes("urgent") ||
    lower.includes("asap") ||
    lower.includes("as soon as possible") ||
    lower.includes("today") ||
    lower.includes("right now") ||
    lower.includes("immediately")
  ) {
    return "urgent";
  }
  
  return "best_price";
}

/**
 * Extract need-by date from message (deterministic parsing)
 */
function extractNeedBy(message: string): string | "ASAP" | undefined {
  const lower = message.toLowerCase().trim();
  
  // ASAP patterns
  if (lower.includes("asap") || lower.includes("as soon as possible") || lower === "today") {
    return "ASAP";
  }
  
  // Tomorrow: calculate tomorrow's date
  if (lower === "tomorrow" || lower.includes("tomorrow")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0]; // YYYY-MM-DD
  }
  
  // Today: use ASAP
  if (lower.includes("today")) {
    return "ASAP";
  }
  
  // Try to parse ISO date (YYYY-MM-DD)
  const isoDateMatch = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDateMatch) {
    return isoDateMatch[1];
  }
  
  // Try to parse MM/DD/YYYY or MM-DD-YYYY
  const usDateMatch = message.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (usDateMatch) {
    const [, month, day, year] = usDateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Try to parse MM/DD/YY or MM-DD-YY (2-digit year)
  const usDateMatch2Digit = message.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
  if (usDateMatch2Digit) {
    const [, month, day, year2Digit] = usDateMatch2Digit;
    // Convert 2-digit year to 4-digit (assume 2000-2099)
    const year = parseInt(year2Digit, 10);
    const fullYear = year < 50 ? 2000 + year : 1900 + year; // 00-49 = 2000-2049, 50-99 = 1950-1999
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  return undefined;
}

/**
 * Extract job name or PO from message
 */
function extractJobNameOrPo(message: string): string | null {
  // Patterns: "job name is X", "PO is X", "P.O. X", "job: X", "PO: X"
  const patterns = [
    /job\s+name\s+is\s+(.+?)(?:\.|$)/i,
    /po\s+is\s+(.+?)(?:\.|$)/i,
    /p\.o\.\s+(.+?)(?:\.|$)/i,
    /job:\s*(.+?)(?:\.|$)/i,
    /po:\s*(.+?)(?:\.|$)/i,
    /purchase\s+order\s+(.+?)(?:\.|$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted.length >= 2) {
        return extracted;
      }
    }
  }
  
  return null;
}

/**
 * Extract delivery address from message
 */
function extractDeliveryAddress(message: string): string | null {
  // Look for address patterns: number + street-like word
  const addressPattern = /\b\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Cir|Circle)\b/i;
  
  const match = message.match(addressPattern);
  if (match) {
    // Extract a reasonable address chunk (up to 50 chars or until punctuation)
    const startIdx = message.indexOf(match[0]);
    const endIdx = Math.min(
      startIdx + 50,
      message.length,
      message.indexOf(".", startIdx) !== -1 ? message.indexOf(".", startIdx) : message.length,
      message.indexOf(",", startIdx) !== -1 ? message.indexOf(",", startIdx) : message.length
    );
    const address = message.substring(startIdx, endIdx).trim();
    if (address.length >= 8) {
      return address;
    }
  }
  
  return null;
}

/**
 * Check if message is a generic starter phrase (should not create line items)
 */
function isGenericStarterPhrase(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const genericPhrases = [
    "i need materials",
    "need materials",
    "get quotes",
    "i need a quote",
    "quote me",
    "pricing",
    "price check",
    "i need supplies",
    "need supplies",
    "i need stuff",
    "need stuff",
  ];
  
  return genericPhrases.some((phrase) => lower === phrase || lower.startsWith(phrase + " "));
}

/**
 * Known material keywords (for validating line item descriptions)
 */
const MATERIAL_KEYWORDS = [
  "shingle", "shingles",
  "osb", "plywood",
  "stud", "studs", "2x4", "2x6",
  "drywall", "sheetrock",
  "nail", "nails",
  "screw", "screws",
  "insulation",
  "pipe", "pipes",
  "fixture", "fixtures",
  "wire", "wiring",
  "outlet", "outlets",
  "switch", "switches",
  "panel", "panels",
  "breaker", "breakers",
  "conduit",
  "gutter", "gutters",
  "flashing",
  "drip edge",
  "roofing",
  "siding",
  "lumber",
  "board", "boards",
  "timber",
  "vinyl",
  "fiber cement",
  "lap siding",
  "gypsum",
  "fiberglass",
  "foam",
  "batting",
  "window", "windows",
  "door", "doors",
  "frame", "frames",
  "glass",
  "concrete",
  "cement",
  "block", "blocks",
  "brick", "bricks",
  "mortar",
  "paint",
  "primer",
  "stain",
  "coating",
];

/**
 * Check if description contains known material keywords
 */
function hasMaterialKeyword(description: string): boolean {
  const lower = description.toLowerCase();
  return MATERIAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Normalize line item description
 */
function normalizeLineItemDescription(desc: string): string {
  let normalized = desc.toLowerCase().trim();
  // Remove leading stopwords
  normalized = normalized.replace(/^(of|a|an)\s+/i, "");
  // Remove trailing punctuation
  normalized = normalized.replace(/[.,;:!?]+$/, "");
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

/**
 * Normalize unit (singularize basic plurals)
 */
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  // Simple singularization for common units
  const singularMap: Record<string, string> = {
    bundles: "bundle",
    boxes: "box",
    sheets: "sheet",
    pieces: "piece",
    rolls: "roll",
    gallons: "gallon",
    pounds: "pound",
    lbs: "pound",
    feet: "ft",
    squares: "square",
  };
  return singularMap[normalized] || normalized;
}

/**
 * Deduplicate line items by combining duplicates and summing quantities
 */
function dedupeLineItems(items: AgentLineItem[]): AgentLineItem[] {
  const seen = new Map<string, AgentLineItem>();
  
  for (const item of items) {
    const normalizedDesc = normalizeLineItemDescription(item.description);
    const normalizedUnit = normalizeUnit(item.unit || "");
    const key = `${normalizedUnit}|${normalizedDesc}`;
    
    if (seen.has(key)) {
      // Sum quantities for duplicates
      const existing = seen.get(key)!;
      existing.quantity += item.quantity;
    } else {
      // First occurrence - store with original unit for display
      seen.set(key, {
        description: item.description.trim(), // Keep original description for display
        quantity: item.quantity,
        unit: item.unit || "", // Keep original unit (preserve plural/singular as provided)
      });
    }
  }
  
  // Return in first occurrence order
  return Array.from(seen.values());
}

/**
 * Check if a string is a category label or category ID
 */
function isCategoryLabel(text: string): boolean {
  const lower = text.trim().toLowerCase();
  
  // Check against all category labels (case-insensitive)
  for (const label of Object.values(CATEGORY_LABELS)) {
    if (label.toLowerCase() === lower) {
      return true;
    }
  }
  
  // Check against category IDs
  for (const id of Object.keys(CATEGORY_LABELS)) {
    if (id.toLowerCase() === lower) {
      return true;
    }
  }
  
  // Also check normalized category input
  const normalized = normalizeCategoryInput(text);
  return normalized.confidence !== "none";
}

/**
 * Check if message is a generic materials request (not specific materials)
 * Examples: "I need roofing materials", "need lumber", "need HVAC supplies"
 */
function isGenericMaterialsRequest(text: string, categoryLabel?: string): boolean {
  const lower = text.trim().toLowerCase();
  
  // Pattern 1: contains "need" / "looking for" / "want" + ("materials"|"supplies"|"stuff")
  const genericPattern = /\b(need|looking for|want|wants|needs)\s+(?:some\s+)?(?:roofing|hvac|plumbing|electrical|lumber|siding)?\s*(materials|supplies|stuff)\b/i;
  if (genericPattern.test(text)) {
    return true;
  }
  
  // Pattern 2: message equals or mostly equals a category label
  if (categoryLabel) {
    const categoryLower = categoryLabel.toLowerCase();
    if (lower === categoryLower || lower === `need ${categoryLower}` || lower === `i need ${categoryLower}`) {
      return true;
    }
  }
  
  // Also check against all category labels
  for (const label of Object.values(CATEGORY_LABELS)) {
    const labelLower = label.toLowerCase();
    if (lower === labelLower || lower === `need ${labelLower}` || lower === `i need ${labelLower}`) {
      return true;
    }
  }
  
  // Pattern 3: short message ending with "materials/supplies/stuff" without quantity
  const shortGenericPattern = /^(?:i\s+)?(?:need|want|looking for)\s+(?:roofing|hvac|plumbing|electrical|lumber|siding)?\s*(?:materials|supplies|stuff)\s*$/i;
  if (shortGenericPattern.test(lower) && lower.length < 50) {
    return true;
  }
  
  return false;
}

/**
 * Extract line items from message
 */
function extractLineItems(
  message: string,
  currentDraft?: RouterDraft
): AgentLineItem[] | null {
  // Guard: Never extract line items from generic starter phrases
  if (isGenericStarterPhrase(message)) {
    return null;
  }
  
  // Guard: Never extract line items from generic materials requests
  const categoryLabel = currentDraft?.categoryId ? categoryIdToLabel[currentDraft.categoryId as keyof typeof categoryIdToLabel] : undefined;
  if (isGenericMaterialsRequest(message, categoryLabel)) {
    return null;
  }
  
  const items: AgentLineItem[] = [];
  
  // Handle line items follow-up: if __lastAskedSlot is "lineItems"
  if (currentDraft?.__lastAskedSlot === "lineItems") {
    // First check if message is just a number (update last item quantity)
    if (currentDraft.lineItems && currentDraft.lineItems.length > 0) {
      const trimmedMsg = message.trim();
      const qty = parseSpelledNumber(trimmedMsg);
      // Check if message is ONLY a number (no other text)
      if (qty !== null && qty > 0 && /^\s*(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*$/i.test(trimmedMsg)) {
        // Message is ONLY a number - update last line item's quantity
        const lastItem = currentDraft.lineItems[currentDraft.lineItems.length - 1];
        if (lastItem) {
          return [
            ...currentDraft.lineItems.slice(0, -1),
            { ...lastItem, quantity: qty },
          ];
        }
      }
    }
    
    // Message is NOT just a number - attempt to parse line items from it
    // This supports "100 bundles shingles", "one box of nails", multiple items with "and"/commas
    // Continue to normal extraction below - if it succeeds, we'll have lineItems
  }
  
  // Common units
  const units = [
    "bundle",
    "bundles",
    "box",
    "boxes",
    "sheet",
    "sheets",
    "piece",
    "pieces",
    "roll",
    "rolls",
    "gallon",
    "gallons",
    "lb",
    "lbs",
    "pound",
    "pounds",
    "ft",
    "feet",
    "sqft",
    "square feet",
    "square",
    "squares",
    "ea",
    "each",
  ];
  
  // Pattern: number + unit + "of" + description OR number + unit + description
  // Use a single pattern that handles both cases to avoid duplicates
  const numberWords = Object.keys({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  }).join("|");
  
  // Combined pattern: (number) + (unit) + (optional "of") + (description)
  // This prevents both patterns from matching the same text
  const combinedPattern = new RegExp(
    `(\\d+|${numberWords})\\s+(${units.join("|")})\\s+(?:of\\s+)?(.+?)(?:,|and|&|$|;|\\s*$)`,
    "gi"
  );
  
  const seenKeys = new Set<string>();
  let match;
  while ((match = combinedPattern.exec(message)) !== null) {
    const qtyStr = match[1];
    const unit = match[2];
    let description = match[3]?.trim();
    
    if (description && description.length > 0) {
      // Normalize description: trim, collapse whitespace, remove leading "of ", remove trailing punctuation
      description = description.trim();
      description = description.replace(/\s+/g, " "); // collapse whitespace
      description = description.replace(/^of\s+/i, ""); // remove leading "of "
      description = description.replace(/[.,;:]+$/, ""); // remove trailing punctuation
      description = description.trim();
      
      if (description.length > 0) {
        const qty = parseSpelledNumber(qtyStr);
        if (qty !== null && qty > 0) {
          // Normalize unit: trim + lowercase
          const normalizedUnit = (unit || "").trim().toLowerCase();
          
          // Check for duplicates before adding (prevent same item from being added twice)
          // Use normalized values for deduplication key
          const normalizedDesc = description.toLowerCase();
          const dedupeKey = `${qty}|${normalizedUnit}|${normalizedDesc}`;
          
          if (!seenKeys.has(dedupeKey)) {
            seenKeys.add(dedupeKey);
            items.push({
              description, // Keep normalized for consistency
              quantity: qty,
              unit: unit.toLowerCase().trim(), // Keep original unit (plural/singular as provided)
            });
          }
        }
      }
    }
  }
  
  // Also handle simple patterns like "shingles, nails, drip edge" (no quantities)
  // BUT only if they contain known material keywords
  // Split on commas, semicolons, "and", "&"
  if (items.length === 0) {
    const simpleItems = message
      .split(/,|;|and|&/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^\d+$/.test(s)) // Exclude pure numbers
      .filter((s) => hasMaterialKeyword(s)) // Only include items with known material keywords
      .filter((s) => !isCategoryLabel(s)) // NEVER create line items from category labels
      .map((s) => {
        // Normalize: remove leading "of ", trailing punctuation, collapse whitespace
        return s.replace(/^of\s+/i, "").replace(/[.,;:!?]+$/, "").replace(/\s+/g, " ").trim();
      })
      .filter((s) => s.length > 0);
    
    // Also require either explicit quantity OR at least 2 meaningful words
    const validItems = simpleItems.filter((desc) => {
      // If it's a single token, it must have a quantity (already filtered above)
      // If it's multiple words, it's likely a material description
      const words = desc.split(/\s+/).filter((w) => w.length > 0);
      return words.length >= 2 || hasMaterialKeyword(desc);
    });
    
    if (validItems.length > 0) {
      const simpleLineItems: AgentLineItem[] = validItems.map((desc) => ({
        description: desc,
        quantity: 1,
        unit: "",
      }));
      
      // Deduplicate simple items
      const seen = new Set<string>();
      const deduped: AgentLineItem[] = [];
      
      for (const item of simpleLineItems) {
        const normalizedDesc = item.description.toLowerCase().trim();
        const key = `${item.quantity}|${item.unit || ""}|${normalizedDesc}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      
      return deduped.length > 0 ? deduped : null;
    }
  }
  
  // Final deduplication pass for items from patterns (BOTH patterns may have matched)
  // Use dedupeLineItems which sums quantities for duplicates
  if (items.length > 0) {
    const deduped = dedupeLineItems(items);
    return deduped.length > 0 ? deduped : null;
  }
  
  return null;
}

/**
 * Get resolved slots from draft (normalize Set/Array to Set)
 */
function getResolvedSlots(draft: RouterDraft | undefined): Set<SlotKey> {
  if (!draft?.__resolvedSlots) {
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
 * Determine missing slots for RFQ creation
 * CRITICAL: Exclude resolved slots - never re-ask resolved questions
 */
function getMissingSlots(draft: Partial<AgentDraftRFQ>): SlotKey[] {
  const routerDraft = draft as RouterDraft;
  const resolvedSlots = getResolvedSlots(routerDraft);
  const missing: SlotKey[] = [];
  
  // Only check slots that are NOT resolved
  if (!resolvedSlots.has("jobNameOrPo") && (!draft.jobNameOrPo || draft.jobNameOrPo.trim().length < 2)) {
    missing.push("jobNameOrPo");
  }
  
  if (!resolvedSlots.has("categoryId") && !draft.categoryId) {
    missing.push("categoryId");
  }
  
  if (!resolvedSlots.has("fulfillmentType") && !draft.fulfillmentType) {
    missing.push("fulfillmentType");
  }
  
  if (
    !resolvedSlots.has("deliveryAddress") &&
    draft.fulfillmentType === "DELIVERY" &&
    (!draft.deliveryAddress || draft.deliveryAddress.trim().length < 8)
  ) {
    missing.push("deliveryAddress");
  }
  
  if (
    !resolvedSlots.has("lineItems") &&
    (
      !draft.lineItems ||
      !Array.isArray(draft.lineItems) ||
      draft.lineItems.length === 0 ||
      !draft.lineItems.some((item) => item.quantity > 0)
    )
  ) {
    missing.push("lineItems");
  }
  
  // needBy: required (user must specify when they need it)
  if (!resolvedSlots.has("needBy") && (!draft.needBy || (typeof draft.needBy === "string" && draft.needBy.trim().length === 0))) {
    missing.push("needBy");
  }
  
  return missing;
}

/**
 * Generate next question based on missing slots
 * CRITICAL: Never ask about resolved slots (they're already excluded from missingSlots)
 */
function generateNextQuestion(missingSlots: SlotKey[]): string | undefined {
  if (missingSlots.length === 0) {
    return undefined;
  }
  
  // Priority order for questions
  if (missingSlots.includes("categoryId")) {
    return "What category is this for? (Roofing, HVAC, Plumbing, Electrical, Lumber/Siding)";
  }
  
  if (missingSlots.includes("fulfillmentType")) {
    return "Is this pickup or delivery?";
  }
  
  if (missingSlots.includes("deliveryAddress")) {
    return "What's the delivery address?";
  }
  
  if (missingSlots.includes("needBy")) {
    return "When do you need it? (ASAP / Today / Tomorrow / Pick a date)";
  }
  
  if (missingSlots.includes("lineItems")) {
    return "What materials and quantities do you need? (Example: 10 bundles of shingles)";
  }
  
  // Special case: if lineItems is missing and we just asked about it, provide better clarification
  // This is handled in routeIntent where we check if lineItems extraction failed
  
  if (missingSlots.includes("jobNameOrPo")) {
    return "Do you have a job name or PO to label this request?";
  }
  
  return undefined;
}

/**
 * Check if user message is a yes/no response
 */
function isYesNoResponse(message: string): boolean {
  const lower = message.trim().toLowerCase();
  const yesNoResponses = ["yes", "y", "yeah", "yep", "sure", "ok", "okay", "no", "n", "nah", "nope"];
  return yesNoResponses.includes(lower);
}

/**
 * Yes/no set for jobNameOrPo follow-up
 */
const YES_NO = new Set(["yes", "y", "yeah", "yep", "sure", "ok", "okay", "no", "n", "nah", "nope"]);

/**
 * Check if message indicates advice-seeking
 */
function isAdviceMessage(message: string): boolean {
  const lower = message.toLowerCase();
  
  const adviceIndicators = [
    "how",
    "should i",
    "what's best",
    "what is best",
    "recommend",
    "difference between",
    "what do i need",
    "help me choose",
    "not sure",
    "unsure",
    "which",
    "advice",
  ];
  
  const rfqIndicators = [
    "quote",
    "price",
    "order",
    "need",
    "looking for",
    "rfq",
    "bid",
    "request",
    "materials",
    "supplies",
  ];
  
  const hasAdvice = adviceIndicators.some((indicator) => lower.includes(indicator));
  const hasRfqIntent = rfqIndicators.some((indicator) => lower.includes(indicator));
  
  return hasAdvice && !hasRfqIntent;
}

/**
 * Check if message indicates RFQ intent
 */
function hasRfqIntent(message: string): boolean {
  const lower = message.toLowerCase();
  
  const rfqIndicators = [
    "quote",
    "price",
    "order",
    "need",
    "looking for",
    "rfq",
    "bid",
    "request",
    "materials",
    "supplies",
    "want",
    "buy",
  ];
  
  return rfqIndicators.some((indicator) => lower.includes(indicator));
}

/**
 * Check if draft has any RFQ slots started
 */
function hasRfqSlotsStarted(draft?: Partial<AgentDraftRFQ>): boolean {
  if (!draft) return false;
  
  return !!(
    draft.categoryId ||
    draft.fulfillmentType ||
    draft.lineItems ||
    draft.jobNameOrPo ||
    draft.deliveryAddress
  );
}

/**
 * Detect if user is correcting a resolved slot
 * Returns the slot key if a correction is detected, null otherwise
 */
function detectCorrection(
  userMessage: string,
  draft: RouterDraft | undefined
): { slot: SlotKey; newValue: any; acknowledgment: string } | null {
  if (!draft) return null;
  
  const resolvedSlots = getResolvedSlots(draft);
  if (resolvedSlots.size === 0) return null;
  
  const lower = userMessage.toLowerCase();
  
  // Correction patterns: "no, it's X", "actually, it's Y", "not X, it's Y", "change it to Y"
  const correctionPatterns = [
    /(?:no|nope|nah|not|wrong|incorrect|actually|change|correct|fix)\s+(?:it'?s\s+)?(.+)/i,
    /(?:it'?s|that'?s)\s+(?:not|wrong|incorrect)\s+(.+)/i,
  ];
  
  // Check for category corrections
  if (resolvedSlots.has("categoryId") && draft.categoryId) {
    const normalizedCategory = normalizeCategoryInput(userMessage);
    if (normalizedCategory.confidence !== "none" && normalizedCategory.categoryId) {
      const newCategoryId = normalizedCategory.categoryId;
      // Only treat as correction if it's different from current
      if (newCategoryId !== draft.categoryId) {
        const categoryLabel = categoryIdToLabel[newCategoryId as keyof typeof categoryIdToLabel];
        const oldCategoryLabel = draft.categoryId ? categoryIdToLabel[draft.categoryId as keyof typeof categoryIdToLabel] : undefined;
        return {
          slot: "categoryId",
          newValue: newCategoryId,
          acknowledgment: `Got it — ${categoryLabel}, not ${oldCategoryLabel || "that"}.`,
        };
      }
    }
    // Check for explicit correction patterns
    for (const pattern of correctionPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        const normalizedCategory = normalizeCategoryInput(match[1]);
        if (normalizedCategory.confidence !== "none" && normalizedCategory.categoryId && normalizedCategory.categoryId !== draft.categoryId) {
          const categoryLabel = categoryIdToLabel[normalizedCategory.categoryId as keyof typeof categoryIdToLabel];
          const oldCategoryLabel = draft.categoryId ? categoryIdToLabel[draft.categoryId as keyof typeof categoryIdToLabel] : undefined;
          return {
            slot: "categoryId",
            newValue: normalizedCategory.categoryId,
            acknowledgment: `Got it — ${categoryLabel}, not ${oldCategoryLabel || "that"}.`,
          };
        }
      }
    }
  }
  
  // Check for fulfillmentType corrections
  if (resolvedSlots.has("fulfillmentType") && draft.fulfillmentType) {
    const extractedFulfillment = extractFulfillmentType(userMessage);
    if (extractedFulfillment && extractedFulfillment !== draft.fulfillmentType) {
      const fulfillmentLabel = extractedFulfillment === "PICKUP" ? "pickup" : "delivery";
      const oldLabel = draft.fulfillmentType === "PICKUP" ? "pickup" : "delivery";
      return {
        slot: "fulfillmentType",
        newValue: extractedFulfillment,
        acknowledgment: `Got it — ${fulfillmentLabel}, not ${oldLabel}.`,
      };
    }
  }
  
  // Check for jobNameOrPo corrections (if user explicitly provides a different name)
  if (resolvedSlots.has("jobNameOrPo") && draft.jobNameOrPo) {
    const extractedJobName = extractJobNameOrPo(userMessage);
    if (extractedJobName && extractedJobName.toLowerCase() !== draft.jobNameOrPo.toLowerCase()) {
      return {
        slot: "jobNameOrPo",
        newValue: extractedJobName,
        acknowledgment: `Got it — "${extractedJobName}", not "${draft.jobNameOrPo}".`,
      };
    }
  }
  
  return null;
}

/**
 * Route intent from user message and current draft state
 */
export function routeIntent(args: {
  threadId: string;
  userMessage: string;
  currentDraft?: Partial<AgentDraftRFQ>;
}): RouterDecision {
  const { threadId, userMessage, currentDraft } = args;
  const draft = currentDraft as RouterDraft | undefined;
  
  const reasons: string[] = [];
  const updatedDraft: Partial<AgentDraftRFQ> = { ...draft };
  let confidence: "high" | "medium" | "low" = "medium";
  let correctionAcknowledgment: string | undefined;
  
  // RULE 2: User Corrections Override Everything
  // Detect if user is correcting a resolved slot
  const correction = detectCorrection(userMessage, draft);
  if (correction) {
    // Unlock the slot (remove from resolved slots)
    const resolvedSlots = getResolvedSlots(draft);
    resolvedSlots.delete(correction.slot);
    // Update the draft with the corrected value
    (updatedDraft as any)[correction.slot] = correction.newValue;
    // Store updated resolved slots (will be re-locked after this turn)
    (updatedDraft as any).__resolvedSlots = Array.from(resolvedSlots);
    correctionAcknowledgment = correction.acknowledgment;
    reasons.push(`User correction detected for ${correction.slot}`);
  }
  
  // CONVERSATIONAL INTELLIGENCE: Extract category FIRST (before generic phrase check)
  // This ensures "I need materials for a roof" → extracts "roofing" immediately
  // Only extract if we don't already have a categoryId OR if it was just corrected
  if (!updatedDraft.categoryId || (correction && correction.slot === "categoryId")) {
    const categoryId = extractCategory(userMessage);
    if (categoryId) {
      updatedDraft.categoryId = categoryId;
      reasons.push(`Extracted category: ${categoryId} (conversational intelligence)`);
    }
  }
  
  // Guard: Handle generic starter phrases
  // If message is a generic request intent, set mode to RFQ_CREATE but don't extract line items
  const isGenericPhrase = isGenericStarterPhrase(userMessage);
  
  if (isGenericPhrase) {
    // Set mode to RFQ_CREATE but don't modify lineItems
    // Don't set readyToDispatch
    // Ensure nextQuestion asks for the most important missing slot
    const missingSlots = getMissingSlots(updatedDraft);
    const nextQuestion = generateNextQuestion(missingSlots);
    
    // Determine mode and capability
    let mode: IntentMode = "RFQ_CREATE";
    let capabilityId: CapabilityId = "cap.intent_router.v1";
    
    if (hasRfqSlotsStarted(draft)) {
      mode = "RFQ_UPDATE";
    }
    
    return {
      mode,
      capabilityId,
      updatedDraft: Object.keys(updatedDraft).length > 0 ? updatedDraft : undefined,
      missingSlots,
      nextQuestion,
      readyToDispatch: false, // Never ready for generic phrases
      confidence: "medium",
      reasons: ["Generic starter phrase detected"],
      idempotencyKey: `generic_${threadId}_${userMessage.trim()}`,
      acknowledgment: correctionAcknowledgment,
    };
  }
  
  // SLOT-ANSWER PRECEDENCE: If __lastAskedSlot is set, prioritize that slot's answer
  // This prevents single-word button answers from being misparsed as line items or job names
  let skipOtherExtraction = false;
  
  if (draft?.__lastAskedSlot) {
    const lastAskedSlot = draft.__lastAskedSlot;
    
    // Handle categoryId slot answer
    if (lastAskedSlot === "categoryId") {
      const normalizedCategory = normalizeCategoryInput(userMessage);
      if (normalizedCategory.confidence !== "none" && normalizedCategory.categoryId) {
        updatedDraft.categoryId = normalizedCategory.categoryId;
        reasons.push(`slot-answer:categoryId`);
        skipOtherExtraction = true; // Skip ALL other extraction
      }
    }
    
    // Handle fulfillmentType slot answer
    if (lastAskedSlot === "fulfillmentType") {
      const fulfillmentGuess = extractFulfillmentType(userMessage);
      if (fulfillmentGuess) {
        updatedDraft.fulfillmentType = fulfillmentGuess;
        reasons.push(`slot-answer:fulfillmentType`);
        skipOtherExtraction = true; // Skip ALL other extraction
      }
    }
    
    // Handle jobNameOrPo slot answer with guard against line-item-like text
    if (lastAskedSlot === "jobNameOrPo") {
      const msg = userMessage.trim();
      const lower = msg.toLowerCase();
      
      // Guard: Prevent line-item-like text from being assigned to jobNameOrPo
      const looksLikeLineItems =
        /\b\d+\b/.test(userMessage) && /\b(bundle|bundles|box|boxes|pcs|pieces|ea|each|roll|rolls|bag|bags|lf|sf|sq\s?ft|ft|feet|yd|yard|ton|lb|gallon|gal)\b/i.test(userMessage);
      
      if (msg.length > 0 && !YES_NO.has(lower) && !looksLikeLineItems) {
        updatedDraft.jobNameOrPo = msg;
        updatedDraft.expectedField = null; // Clear expectedField after successful extraction
        updatedDraft.__lastAskedSlot = undefined; // Clear slot after successful assignment
        reasons.push(`slot-answer:jobNameOrPo`);
      } else if (YES_NO.has(lower) && ["yes", "y", "yeah", "yep", "sure", "ok", "okay"].includes(lower)) {
        // User said yes-ish but didn't provide label - handled in nextQuestion generation below
        reasons.push("User confirmed but didn't provide job name/PO");
      }
      skipOtherExtraction = true; // Skip line items extraction
    }
    
    // Handle lineItems slot answer
    // Note: We don't return early here - let the normal extraction logic handle it
    // If extraction succeeds, we'll have lineItems and won't ask "How many..."
    // If extraction fails, we'll ask for clarification below
  }
  
  // Category extraction already happened above (before generic phrase check)
  // Only re-extract if slot-answer didn't set it and we still don't have it
  if (!updatedDraft.categoryId && !skipOtherExtraction) {
    const categoryId = extractCategory(userMessage);
    if (categoryId) {
      updatedDraft.categoryId = categoryId;
      reasons.push(`Extracted category: ${categoryId} (conversational intelligence)`);
      // Don't set skipOtherExtraction - allow other extraction to continue
    }
  }
  
  if (!skipOtherExtraction || !updatedDraft.fulfillmentType) {
    const fulfillmentType = extractFulfillmentType(userMessage);
    if (fulfillmentType) {
      updatedDraft.fulfillmentType = fulfillmentType;
      reasons.push(`Extracted fulfillment: ${fulfillmentType}`);
    }
  }
  
  const priority = extractPriority(userMessage);
  if (priority !== "best_price" || !draft?.priority) {
    updatedDraft.priority = priority;
    if (priority !== "best_price") {
      reasons.push(`Extracted priority: ${priority}`);
    }
  }
  
  // A3: Only extract needBy if expectedField allows it
  // BUT preserve existing needBy from draft if it's already set
  if (!updatedDraft.needBy && draft?.needBy) {
    updatedDraft.needBy = draft.needBy;
  }
  
  const expectedField = updatedDraft.expectedField || draft?.expectedField;
  const shouldExtractNeedBy = expectedField === "neededBy" || draft?.__lastAskedSlot === "needBy";
  
  const needBy = extractNeedBy(userMessage);
  if (needBy && shouldExtractNeedBy) {
    updatedDraft.needBy = needBy;
    updatedDraft.expectedField = null; // Clear expectedField after successful extraction
    reasons.push(`Extracted needBy: ${needBy}`);
  } else if (needBy && !shouldExtractNeedBy) {
    // Allow extraction if it's a clear date pattern (ASAP, today, tomorrow, date)
    // But only if we're not currently collecting a different field
    if (expectedField === null || expectedField === undefined) {
      updatedDraft.needBy = needBy;
      reasons.push(`Extracted needBy: ${needBy}`);
    }
  }
  
  // Handle jobNameOrPo extraction
  // ONLY set from explicit patterns OR when __lastAskedSlot === "jobNameOrPo" and message is NOT yes/no
  // NEVER infer from arbitrary text (like "100 bundles" -> jobNameOrPo)
  // If slot-answer precedence already handled it above, skip here
  if (!skipOtherExtraction) {
    // Only extract from explicit patterns when NOT in slot-answer mode
    const explicitJobNameOrPo = extractJobNameOrPo(userMessage);
    if (explicitJobNameOrPo) {
      updatedDraft.jobNameOrPo = explicitJobNameOrPo;
      reasons.push(`Extracted jobNameOrPo from explicit pattern: ${explicitJobNameOrPo}`);
    }
  }
  
  // Only extract delivery address if DELIVERY context is active or message suggests delivery
  if (
    updatedDraft.fulfillmentType === "DELIVERY" ||
    extractFulfillmentType(userMessage) === "DELIVERY"
  ) {
    const deliveryAddress = extractDeliveryAddress(userMessage);
    if (deliveryAddress) {
      updatedDraft.deliveryAddress = deliveryAddress;
      reasons.push(`Extracted deliveryAddress`);
    }
  }
  
  // Extract delivery address first (before line items to avoid confusion)
  // Only extract delivery address if DELIVERY context is active or message suggests delivery
  if (
    updatedDraft.fulfillmentType === "DELIVERY" ||
    extractFulfillmentType(userMessage) === "DELIVERY"
  ) {
    const deliveryAddress = extractDeliveryAddress(userMessage);
    if (deliveryAddress) {
      updatedDraft.deliveryAddress = deliveryAddress;
      reasons.push(`Extracted deliveryAddress`);
    }
  }
  
  // A4: Make "line items" collection ONLY populate lineItems
  // Extract line items if:
  // 1. expectedField is "lineItems" OR __lastAskedSlot is "lineItems" (collection mode), OR
  // 2. Message clearly contains line items (qty + unit + description) and we're not in slot-answer mode
  // NEVER write to jobNameOrPo from parsing
  const effectiveExpectedField = updatedDraft.expectedField ?? draft?.expectedField;
  const isLineItemsCollectionMode = effectiveExpectedField === "lineItems" || draft?.__lastAskedSlot === "lineItems";
  
  // Extract line items (but exclude any address-like text)
  // ONLY if we're not skipping other extraction (slot-answer precedence)
  // Allow extraction in collection mode OR when message clearly contains line items
  if (!skipOtherExtraction && (isLineItemsCollectionMode || !draft?.__lastAskedSlot)) {
    let messageForLineItems = userMessage;
    if (updatedDraft.deliveryAddress) {
      // Remove the address from the message before extracting line items
      messageForLineItems = messageForLineItems.replace(
        new RegExp(updatedDraft.deliveryAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        ""
      );
    }
    
    // CRITICAL: Check if this is a generic materials request BEFORE extracting line items
    // If draft has no lineItems and message is generic, ask for real materials
    const categoryLabel = updatedDraft.categoryId ? categoryIdToLabel[updatedDraft.categoryId as keyof typeof categoryIdToLabel] : undefined;
    if ((!draft?.lineItems || draft.lineItems.length === 0) && isGenericMaterialsRequest(messageForLineItems, categoryLabel)) {
      // Don't extract line items - ask for real materials instead
      const missingSlots = getMissingSlots(updatedDraft);
      if (!missingSlots.includes("lineItems")) {
        missingSlots.push("lineItems");
      }
      
      // Return early with decision that asks for line items
      // Set the slot at the same time you set the question
      updatedDraft.__lastAskedSlot = "lineItems";
      updatedDraft.expectedField = "lineItems";
      
      return {
        mode: "RFQ_CREATE",
        capabilityId: "cap.rfq_builder.v1",
        updatedDraft: {
          ...updatedDraft,
          // Keep categoryId if we can infer it, but DO NOT set lineItems
        },
        missingSlots,
        nextQuestion: "Please tell me the quantity + item (example: 10 bundles of shingles).",
        readyToDispatch: false,
        confidence: "high",
        reasons: ["Generic materials request detected - need specific materials and quantities"],
        idempotencyKey: generateIdempotencyKey(threadId, userMessage, updatedDraft),
        acknowledgment: correctionAcknowledgment,
      };
    }
    
    const lineItems = extractLineItems(messageForLineItems, draft);
    if (lineItems) {
      // Filter out any line items that look like addresses or category labels
      const filteredItems = lineItems.filter((item) => {
        // Check if description looks like an address (has number + street word)
        const addressPattern = /\b\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Cir|Circle)\b/i;
        if (addressPattern.test(item.description)) {
          return false;
        }
        // NEVER create line items from category labels
        if (isCategoryLabel(item.description)) {
          return false;
        }
        return true;
      });
      
      if (filteredItems.length > 0) {
        // Normalize and dedupe line items BEFORE assigning
        // Normalize each item's description: trim, collapse whitespace, remove leading "of ", remove trailing punctuation
        const normalizedItems = filteredItems.map(item => {
          let desc = item.description.trim();
          desc = desc.replace(/\s+/g, " "); // collapse whitespace
          desc = desc.replace(/^of\s+/i, ""); // remove leading "of "
          desc = desc.replace(/[.,;:]+$/, ""); // remove trailing punctuation
          desc = desc.trim();
          
          return {
            description: desc,
            quantity: item.quantity,
            unit: item.unit || "",
          };
        });
        
        // Dedupe by stable key: qty|unit|desc (keep first occurrence, drop later duplicates)
        const seenKeys = new Set<string>();
        const deduped: AgentLineItem[] = [];
        for (const item of normalizedItems) {
          const normalizedDesc = item.description.toLowerCase();
          const normalizedUnit = (item.unit || "").toLowerCase();
          const key = `${item.quantity}|${normalizedUnit}|${normalizedDesc}`;
          
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            deduped.push(item);
          }
        }
        
        // Ensure no resulting description starts with "of "
        const finalItems = deduped.map(item => ({
          ...item,
          description: item.description.replace(/^of\s+/i, "").trim(),
        }));
        
        updatedDraft.lineItems = finalItems;
        
        // End the collection mode so you never re-ask
        updatedDraft.expectedField = null;
        updatedDraft.__lastAskedSlot = undefined;
        
        reasons.push(`Extracted ${finalItems.length} line item(s)`);
      }
    } else if (draft?.__lastAskedSlot === "lineItems") {
      // Line items extraction failed but we were asking for line items
      // Provide better clarification question
      const missingSlots = getMissingSlots(updatedDraft);
      if (missingSlots.includes("lineItems")) {
        // Override nextQuestion with better clarification
        // This will be set below in generateNextQuestion, but we can improve it
        reasons.push("Line items extraction failed - need clarification");
      }
    }
  }
  
  // Set defaults
  if (!updatedDraft.priority) {
    updatedDraft.priority = "best_price";
  }
  if (!updatedDraft.visibility) {
    updatedDraft.visibility = "broadcast";
  }
  if (!updatedDraft.createdFrom) {
    updatedDraft.createdFrom = "agent";
  }
  
  // Determine mode
  let mode: IntentMode;
  let capabilityId: CapabilityId;
  
  if (isAdviceMessage(userMessage)) {
    mode = "ADVICE";
    capabilityId = "cap.advice_mode.v1";
    reasons.push("Message indicates advice-seeking");
    confidence = "high";
  } else if (hasRfqIntent(userMessage) || hasRfqSlotsStarted(updatedDraft)) {
    if (hasRfqSlotsStarted(draft)) {
      mode = "RFQ_UPDATE";
    } else {
      mode = "RFQ_CREATE";
    }
    reasons.push("Message indicates RFQ intent");
    
    // Check if ready to dispatch
    const missingSlots = getMissingSlots(updatedDraft);
    
    // Special handling: if user said yes/no to jobNameOrPo question, ask for actual job name
    let nextQuestion = generateNextQuestion(missingSlots);
    if (
      draft?.__lastAskedSlot === "jobNameOrPo" &&
      isYesNoResponse(userMessage) &&
      !updatedDraft.jobNameOrPo
    ) {
      nextQuestion = "What should I label it as? (job name or PO)";
      // Ensure jobNameOrPo stays in missing slots
      if (!missingSlots.includes("jobNameOrPo")) {
        missingSlots.push("jobNameOrPo");
      }
      // Set the slot when asking for jobNameOrPo
      updatedDraft.__lastAskedSlot = "jobNameOrPo";
      updatedDraft.expectedField = "jobNameOrPo";
    }
    
    // Special handling: if lineItems extraction failed and we were asking for line items
    if (
      draft?.__lastAskedSlot === "lineItems" &&
      missingSlots.includes("lineItems") &&
      !updatedDraft.lineItems
    ) {
      nextQuestion = "Please tell me the quantity + item (example: 10 bundles of shingles).";
      // Set the slot when asking for lineItems
      updatedDraft.__lastAskedSlot = "lineItems";
      updatedDraft.expectedField = "lineItems";
    }
    
    // Make missing-field question deterministic: if we're asking for a slot, set it
    // This ensures we lock the slot until it's satisfied
    if (missingSlots.length > 0 && !updatedDraft.__lastAskedSlot) {
      const firstMissing = missingSlots[0] as SlotKey;
      if (firstMissing === "jobNameOrPo" || firstMissing === "lineItems" || firstMissing === "needBy") {
        updatedDraft.__lastAskedSlot = firstMissing;
        updatedDraft.expectedField = firstMissing === "needBy" ? "neededBy" : firstMissing;
      }
    }
    
    // Validate the draft as-is (no defaults for required fields)
    // Only set defaults for optional fields
    const draftForValidation: Partial<AgentDraftRFQ> = {
      ...updatedDraft,
      priority: updatedDraft.priority || "best_price",
      visibility: updatedDraft.visibility || "broadcast",
      createdFrom: "agent",
    };
    
    const validation = validateAgentDraftRFQ(draftForValidation);
    // CRITICAL: readyToDispatch can ONLY be true if validation passes
    // SINGLE SOURCE OF TRUTH: Use validateAgentDraftRFQ result only
    // NEVER set readyToDispatch via heuristics - only via validation
    const readyToDispatch = validation.ok;
    
    if (readyToDispatch) {
      capabilityId = "cap.dispatch_rfq.v1";
      reasons.push("Draft is ready to dispatch");
      confidence = "high";
    } else {
      capabilityId = "cap.intent_router.v1";
      reasons.push(`Missing slots: ${missingSlots.join(", ")}`);
      confidence = missingSlots.length <= 2 ? "high" : "medium";
    }
    
    const idempotencyKey = generateIdempotencyKey(threadId, userMessage, updatedDraft);
    
    // Track which slots were just filled (to be locked in slotFiller)
    const newlyResolvedSlots: SlotKey[] = [];
    const resolvedSlots = getResolvedSlots(draft);
    
    // If a slot was filled and wasn't previously resolved, mark it as newly resolved
    if (updatedDraft.categoryId && !resolvedSlots.has("categoryId") && draft?.categoryId !== updatedDraft.categoryId) {
      newlyResolvedSlots.push("categoryId");
    }
    if (updatedDraft.fulfillmentType && !resolvedSlots.has("fulfillmentType") && draft?.fulfillmentType !== updatedDraft.fulfillmentType) {
      newlyResolvedSlots.push("fulfillmentType");
    }
    if (updatedDraft.jobNameOrPo && !resolvedSlots.has("jobNameOrPo") && draft?.jobNameOrPo !== updatedDraft.jobNameOrPo) {
      newlyResolvedSlots.push("jobNameOrPo");
    }
    if (updatedDraft.lineItems && Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0 && !resolvedSlots.has("lineItems")) {
      newlyResolvedSlots.push("lineItems");
    }
    if (updatedDraft.needBy && !resolvedSlots.has("needBy") && draft?.needBy !== updatedDraft.needBy) {
      newlyResolvedSlots.push("needBy");
    }
    if (updatedDraft.deliveryAddress && !resolvedSlots.has("deliveryAddress") && draft?.deliveryAddress !== updatedDraft.deliveryAddress) {
      newlyResolvedSlots.push("deliveryAddress");
    }
    
    // Store newly resolved slots in draft metadata (will be processed in slotFiller)
    if (newlyResolvedSlots.length > 0) {
      (updatedDraft as any).__newlyResolvedSlots = newlyResolvedSlots;
    }
    
    return {
      mode,
      capabilityId,
      updatedDraft,
      missingSlots,
      nextQuestion,
      readyToDispatch,
      confidence,
      reasons,
      idempotencyKey,
      acknowledgment: correctionAcknowledgment,
    };
  } else {
    mode = "UNKNOWN";
    capabilityId = "cap.intent_router.v1";
    reasons.push("Cannot determine intent");
    confidence = "low";
  }
  
  const missingSlots = mode === "ADVICE" ? [] : getMissingSlots(updatedDraft);
  const nextQuestion =
    mode === "UNKNOWN"
      ? "What are you trying to accomplish—get advice or request a quote?"
      : generateNextQuestion(missingSlots);
  
  const idempotencyKey = generateIdempotencyKey(threadId, userMessage, updatedDraft);
  
  return {
    mode,
    capabilityId,
    updatedDraft: mode !== "ADVICE" ? updatedDraft : undefined,
    missingSlots,
    nextQuestion,
    readyToDispatch: false,
    confidence,
    reasons,
    idempotencyKey,
    acknowledgment: correctionAcknowledgment,
  };
}

/**
 * Deterministic intent routing for buyer chat input
 */

import type { CategoryId } from "../categoryIds";
import { normalizeCategoryInput, CATEGORY_LABELS, categoryIdToLabel } from "../categoryDisplay";
import type { AgentDraftRFQ, AgentLineItem, AgentPriority, FulfillmentType } from "./contracts";
import { validateAgentDraftRFQ } from "./contracts";
import type { CapabilityId } from "./capabilities";

/**
 * Intent mode for routing
 */
export type IntentMode = "ADVICE" | "RFQ_CREATE" | "RFQ_UPDATE" | "UNKNOWN";

/**
 * Slot keys that can be extracted from user input
 */
export type SlotKey =
  | "jobNameOrPo"
  | "categoryId"
  | "fulfillmentType"
  | "deliveryAddress"
  | "lineItems"
  | "priority"
  | "needBy";

/**
 * Router decision result
 */
export interface RouterDecision {
  mode: IntentMode;
  capabilityId: CapabilityId;
  updatedDraft?: Partial<AgentDraftRFQ>;
  missingSlots: SlotKey[];
  nextQuestion?: string; // exactly one question if missing slots
  readyToDispatch: boolean; // true only when validateAgentDraftRFQ would pass
  confidence: "high" | "medium" | "low";
  reasons: string[]; // short internal reasons (NOT for UI)
  idempotencyKey: string; // stable hash of (threadId + lastUserMsg + draftSignature)
  acknowledgment?: string; // acknowledgment message for corrections or slot fills
}

/**
 * Extended draft type with router-only metadata
 */
interface RouterDraft extends Partial<AgentDraftRFQ> {
  __lastAskedSlot?: SlotKey;
  __resolvedSlots?: Set<SlotKey> | SlotKey[]; // Track which slots are locked/resolved
}

/**
 * Simple hash function (djb2) for idempotency key
 */
