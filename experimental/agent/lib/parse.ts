/**
 * Agora Agent V1.1 - Deterministic Parsing
 * Extracts structured data from user text without LLM
 */

import { MATERIAL_CATEGORIES } from "@/lib/categoryDisplay";
import { parseLineItems as parseLineItemsRobust } from "@/lib/lineItemParser";

/**
 * Normalize user input: trim, lower, collapse whitespace
 */
export function normalizeInput(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse category from text
 */
export function parseCategory(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  const categoryKeywords: Record<string, string[]> = {
    "HVAC": ["hvac", "heating", "cooling", "air conditioning", "furnace", "ac unit", "heat pump", "air conditioner"],
    "Plumbing": ["plumbing", "pipe", "fixture", "faucet", "toilet", "sink", "water heater", "plumber"],
    "Electrical": ["electrical", "wire", "outlet", "switch", "panel", "breaker", "conduit", "electric"],
    "Roofing": ["roofing", "roof", "shingle", "gutter", "flashing", "drip edge", "roofer"],
    "Lumber": ["lumber", "wood", "board", "2x4", "plywood", "timber", "lumber"],
    "Siding": ["siding", "vinyl", "fiber cement", "lap siding"],
    "Drywall": ["drywall", "sheetrock", "gypsum"],
    "Insulation": ["insulation", "fiberglass", "foam", "batting"],
    "Windows & Doors": ["window", "door", "frame", "glass"],
    "Concrete & Masonry": ["concrete_cement", "cement", "block", "brick", "mortar"],
    "Paint": ["paint", "primer", "stain", "coating"],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((keyword) => lowerText.includes(keyword))) {
      // Validate it's a valid category
      if (MATERIAL_CATEGORIES.includes(category as any)) {
        return category;
      }
    }
  }

  return null;
}

/**
 * Parse fulfillment type from text
 */
export function parseFulfillment(text: string): "delivery" | "pickup" | null {
  const lowerText = text.toLowerCase();
  
  const deliveryKeywords = ["deliver", "delivered", "delivery", "ship", "shipping", "drop off", "dropoff"];
  const pickupKeywords = ["pickup", "pick up", "pick-up", "will call", "will-call", "collect", "i'll pick", "i will pick"];
  
  if (deliveryKeywords.some((kw) => lowerText.includes(kw))) {
    return "delivery";
  }
  if (pickupKeywords.some((kw) => lowerText.includes(kw))) {
    return "pickup";
  }
  
  return null;
}

/**
 * Parse needed date from text
 */
export function parseNeededBy(text: string): Date | null {
  const lowerText = text.toLowerCase();
  const now = new Date();
  
  // Handle relative dates
  if (lowerText.includes("today")) {
    return new Date(now);
  }
  if (lowerText.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  if (lowerText.includes("next week")) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  }
  if (lowerText.includes("next month")) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth;
  }
  
  // Handle weekday names
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (let i = 0; i < weekdays.length; i++) {
    if (lowerText.includes(weekdays[i])) {
      const targetDay = i === 0 ? 1 : i === 6 ? 0 : i + 1; // Monday = 1, Sunday = 0
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence
      const date = new Date(now);
      date.setDate(date.getDate() + daysToAdd);
      return date;
    }
  }
  
  // Handle MM/DD/YYYY or M/D/YYYY
  const datePattern1 = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
  const match1 = text.match(datePattern1);
  if (match1) {
    const [, month, day, year] = match1;
    const fullYear = year.length === 2 ? parseInt(`20${year}`, 10) : parseInt(year, 10);
    const date = new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Handle "Jan 15" or "January 15" format
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const monthAbbrevs = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  
  for (let i = 0; i < monthNames.length; i++) {
    const pattern = new RegExp(`(?:${monthNames[i]}|${monthAbbrevs[i]})\\s+(\\d{1,2})`, "i");
    const match = text.match(pattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const date = new Date(now.getFullYear(), i, day);
      // If date is in the past, assume next year
      if (date < now) {
        date.setFullYear(date.getFullYear() + 1);
      }
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  return null;
}

/**
 * Parse location/address from text
 */
export function parseLocation(text: string): string | null {
  // Look for address patterns: digits + street name + city/state/zip
  const addressPatterns = [
    /\d+\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court)\b[^,]*,\s*[^,]+,\s*[a-z]{2}\s+\d{5}/i,
    /\d+\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court)\b[^,]*,\s*[^,]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?/i,
  ];
  
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  // Look for "address is ..." pattern
  const addressIsPattern = /address\s+is\s+([^.!?]+)/i;
  const match2 = text.match(addressIsPattern);
  if (match2) {
    return match2[1].trim();
  }
  
  // Look for text that contains digits + street-like words
  const hasStreetNumber = /\b\d+\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court)\b/i;
  const hasZip = /\b\d{5}(?:-\d{4})?\b/;
  
  if (hasStreetNumber.test(text) && hasZip.test(text)) {
    // Extract the address portion
    const streetMatch = text.match(/\b\d+\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court)\b[^.!?]*/i);
    if (streetMatch) {
      return streetMatch[0].trim();
    }
  }
  
  return null;
}

/**
 * Check if text looks like an address (to reject from line items)
 */
function looksLikeAddress(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Pattern 1: Contains state abbreviations AND street number pattern
  const stateAbbrevs = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
  const streetNumber = /\b\d+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court|place|pl)\b/i;
  const zipCode = /\b\d{5}(?:-\d{4})?\b/;
  
  if ((stateAbbrevs.test(lowerText) || zipCode.test(lowerText)) && streetNumber.test(lowerText)) {
    return true;
  }
  
  // Pattern 2: City/state comma format with ZIP
  const cityStateZip = /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/i;
  if (cityStateZip.test(text)) {
    return true;
  }
  
  // Pattern 3: Contains "ZIP" or "zip code" with street number
  if ((/\bzip\b/i.test(lowerText) || /\bzip\s*code\b/i.test(lowerText)) && streetNumber.test(lowerText)) {
    return true;
  }
  
  return false;
}

/**
 * Parse roof material type from text (with typo tolerance)
 */
export function parseRoofMaterialType(text: string): "shingle" | "metal" | null {
  const normalized = normalizeInput(text);
  
  // Shingle keywords (with typo tolerance)
  const shingleKeywords = [
    "shingle", "shingles", "asphalt shingle", "asphalt shingles", 
    "composition shingle", "composition shingles",
    // Typo variations
    "shinle", "shingel", "shingls", "shingels", "shingl", "shingl"
  ];
  if (shingleKeywords.some((kw) => normalized.includes(kw))) {
    return "shingle";
  }
  
  // Metal keywords (with typo tolerance)
  const metalKeywords = [
    "metal", "standing seam", "r-panel", "r panel", "corrugated", "metal roof",
    // Typo variations
    "metla", "mtal", "metl"
  ];
  if (metalKeywords.some((kw) => normalized.includes(kw))) {
    return "metal";
  }
  
  return null;
}

/**
 * Parse roof size in squares from text
 * Accepts standalone numbers when expectedField is "roofSizeSquares"
 */
export function parseRoofSizeSquares(text: string, expectedField?: string): number | null {
  const normalized = normalizeInput(text);
  
  // Look for "X squares" or "X square" pattern
  const squaresPattern = /(\d+(?:\.\d+)?)\s*(?:square|squares|sq)/i;
  const squaresMatch = text.match(squaresPattern);
  if (squaresMatch) {
    const squares = parseFloat(squaresMatch[1]);
    if (!isNaN(squares) && squares > 0) {
      return squares;
    }
  }
  
  // Look for "X sqft" or "X sq ft" and convert to squares (1 square = 100 sqft)
  const sqftPattern = /(\d+(?:\.\d+)?)\s*(?:sq\s*ft|sqft|square\s*feet|square\s*foot)/i;
  const sqftMatch = text.match(sqftPattern);
  if (sqftMatch) {
    const sqft = parseFloat(sqftMatch[1]);
    if (!isNaN(sqft) && sqft > 0) {
      return Math.round((sqft / 100) * 10) / 10; // Round to 1 decimal place
    }
  }
  
  // Look for standalone numbers that might be squares (if context suggests it)
  if (normalized.includes("square") || normalized.includes("sq")) {
    const numberPattern = /\b(\d+(?:\.\d+)?)\b/;
    const numberMatch = text.match(numberPattern);
    if (numberMatch) {
      const num = parseFloat(numberMatch[1]);
      if (!isNaN(num) && num > 0 && num < 1000) { // Reasonable range for squares
        return num;
      }
    }
  }
  
  // V1 FIX: Accept standalone numbers when expectedField is "roofSizeSquares"
  // This handles cases like "10" when agent asks "How many squares?"
  if (expectedField === "roofSizeSquares") {
    // Extract first number from text
    const numberPattern = /\b(\d+(?:\.\d+)?)\b/;
    const numberMatch = text.match(numberPattern);
    if (numberMatch) {
      const num = parseFloat(numberMatch[1]);
      // Reasonable range for roof squares (1-1000)
      if (!isNaN(num) && num > 0 && num < 1000) {
        return num;
      }
    }
    
    // Also handle "about X" or "around X"
    const aboutPattern = /(?:about|around|approximately|approx)\s+(\d+(?:\.\d+)?)/i;
    const aboutMatch = text.match(aboutPattern);
    if (aboutMatch) {
      const num = parseFloat(aboutMatch[1]);
      if (!isNaN(num) && num > 0 && num < 1000) {
        return num;
      }
    }
  }
  
  return null;
}

/**
 * Parse whether roof accessories are needed from text
 */
export function parseRoofAccessoriesNeeded(text: string): boolean | null {
  const lowerText = text.toLowerCase();
  
  // Positive indicators
  const yesKeywords = ["yes", "yeah", "yep", "sure", "need", "needed", "required", "include", "with", "accessories", "underlayment", "drip edge", "ridge cap", "vents"];
  if (yesKeywords.some((kw) => lowerText.includes(kw))) {
    return true;
  }
  
  // Negative indicators
  const noKeywords = ["no", "nope", "nah", "without", "don't need", "dont need", "not needed"];
  if (noKeywords.some((kw) => lowerText.includes(kw))) {
    return false;
  }
  
  return null;
}

/**
 * Parse priority from text
 * Accepts: "fastest", "urgent", "cheap", "best price", "auction", "preferred", "not sure", etc.
 */
export function parsePriority(text: string): "fastest" | "best_price" | "preferred" | "not_sure" | null {
  const lowerText = text.toLowerCase();
  
  // Fastest keywords
  const fastestKeywords = ["fastest", "urgent", "asap", "as soon as possible", "quick", "quickly", "rush", "rushed", "immediate", "immediately"];
  if (fastestKeywords.some((kw) => lowerText.includes(kw))) {
    return "fastest";
  }
  
  // Best price keywords
  const bestPriceKeywords = ["best price", "cheapest", "cheap", "lowest price", "best deal", "competitive", "auction", "reverse auction", "bid", "bidding", "cost", "price", "budget"];
  if (bestPriceKeywords.some((kw) => lowerText.includes(kw))) {
    return "best_price";
  }
  
  // Preferred supplier keywords
  const preferredKeywords = ["preferred", "favorite", "usual", "regular", "same", "specific", "one supplier", "single supplier"];
  if (preferredKeywords.some((kw) => lowerText.includes(kw))) {
    return "preferred";
  }
  
  // Not sure keywords
  const notSureKeywords = ["not sure", "unsure", "don't know", "dont know", "not certain", "maybe", "either", "both"];
  if (notSureKeywords.some((kw) => lowerText.includes(kw))) {
    return "not_sure";
  }
  
  // Single letter responses
  if (lowerText.trim() === "a" || lowerText.trim() === "fastest") {
    return "fastest";
  }
  if (lowerText.trim() === "b" || lowerText.trim() === "best price") {
    return "best_price";
  }
  if (lowerText.trim() === "c" || lowerText.trim() === "preferred") {
    return "preferred";
  }
  if (lowerText.trim() === "d" || lowerText.trim() === "not sure") {
    return "not_sure";
  }
  
  return null;
}

/**
 * Parse line items from text
 * Uses the robust lineItemParser for better accuracy
 * Rejects addresses to prevent them from being parsed as line items
 * 
 * CRITICAL: This function MUST reject addresses, ZIP codes, and sentences
 * Returns null if input looks like an address or cannot be parsed as materials
 */
export function parseLineItems(text: string): Array<{ quantity: number; unit: string; description: string }> | null {
  // CRITICAL: Reject addresses before parsing
  if (looksLikeAddress(text)) {
    if (process.env.NODE_ENV === "development") {
      console.debug("🚫 REJECTED_ADDRESS_AS_LINE_ITEM", { text: text.substring(0, 50) });
    }
    return null; // This looks like an address, not materials
  }
  
  const parsed = parseLineItemsRobust(text);
  
  if (parsed.length === 0) {
    return null;
  }

  // Additional safety: filter out items that look like addresses or ZIP codes
  const filtered = parsed.filter((item) => {
    const name = (item.name || item.raw || "").toLowerCase();
    // Reject if it contains ZIP code pattern
    if (/\b\d{5}(?:-\d{4})?\b/.test(name)) {
      return false;
    }
    // Reject if it contains state abbreviation + street pattern
    if (/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i.test(name) && 
        /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court)\b/i.test(name)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return null;
  }

  // Convert to expected format, defaulting quantity to 1 if null
  return filtered.map((item) => ({
    quantity: item.qty ?? 1,
    unit: item.unit || "EA",
    description: item.name || item.raw,
  }));
}

