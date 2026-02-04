/**
 * Materials Gate - Determines if user input is actually a materials list
 * Prevents vague intent messages from being treated as line items
 */

import { parseLineItems } from "@/lib/lineItemParser";

// Vague phrases that indicate intent but not a materials list
const vaguePatterns = [
  /\b(need|want|looking for|require|get|buy)\s+(material|materials|stuff|things|items|products|supplies)\b/i,
  /\b(need|want|looking for|require|get|buy)\s+(help|quote|price|estimate|advice|recommendation)\b/i,
  /\b(new|replace|repair|fix)\s+(roof|roofing|siding|hvac|plumbing|electrical)\b/i,
  /\b(roof|roofing|siding|hvac|plumbing|electrical)\s+(project|job|work|repair|replacement)\b/i,
  /\b(what|which|how many|how much)\s+(do|should|can)\s+(i|you)\s+(need|want|get|buy)\b/i,
];

/**
 * Check if input is a vague intent phrase (not a materials list)
 */
function isVagueIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return vaguePatterns.some((pattern) => pattern.test(lower));
}

/**
 * Check if parsed items contain vague intent text
 */
function hasVagueItemNames(parsed: ReturnType<typeof parseLineItems>): boolean {
  if (!parsed || parsed.length === 0) return false;

  const vagueInName = [
    "need material",
    "need materials",
    "new roof",
    "roofing project",
    "need help",
    "get quote",
    "looking for",
  ];

  return parsed.some((item) => {
    const name = (item.name || item.raw || "").toLowerCase();
    return vagueInName.some((vague) => name.includes(vague));
  });
}

/**
 * Check if input is a valid materials list
 * Returns true if the input contains concrete materials with quantities/units
 */
export function isMaterialsList(input: string): boolean {
  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return false;
  }

  const trimmed = input.trim();
  
  // Check for vague intent first
  if (isVagueIntent(trimmed)) {
    return false;
  }

  // Parse the input
  const parsed = parseLineItems(trimmed);

  // No items parsed
  if (!parsed || parsed.length === 0) {
    return false;
  }

  // Check if any parsed items have vague names
  if (hasVagueItemNames(parsed)) {
    return false;
  }

  // TRUE if:
  // a) >= 2 items, OR
  // b) 1 item where qty != null OR unit != null
  if (parsed.length >= 2) {
    return true;
  }

  if (parsed.length === 1) {
    const item = parsed[0];
    // Item has quantity or unit
    if (item.qty !== null || item.unit !== null) {
      // But check if name is not vague
      const name = (item.name || "").toLowerCase();
      const isVagueName = vaguePatterns.some((pattern) => pattern.test(name));
      return !isVagueName;
    }
    
    // Item has no qty/unit, check if it's a concrete comma-separated list
    if (trimmed.includes(",")) {
      const parts = trimmed.split(",").map((p) => p.trim()).filter((p) => p.length > 2);
      // If we have multiple concrete terms (each > 2 chars), it's likely a list
      if (parts.length >= 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get reason why input is/isn't a materials list (for debugging)
 */
export function reason(input: string): string {
  if (!input || typeof input !== "string") {
    return "Empty input";
  }

  if (isVagueIntent(input)) {
    return "Contains vague intent phrases";
  }

  const parsed = parseLineItems(input);
  if (!parsed || parsed.length === 0) {
    return "No items parsed";
  }

  if (hasVagueItemNames(parsed)) {
    return "Parsed items contain vague names";
  }

  if (parsed.length >= 2) {
    return `Valid: ${parsed.length} items parsed`;
  }

  if (parsed.length === 1) {
    const item = parsed[0];
    if (item.qty !== null || item.unit !== null) {
      return "Valid: 1 item with qty/unit";
    }
    return "1 item but no qty/unit";
  }

  return "Unknown reason";
}

