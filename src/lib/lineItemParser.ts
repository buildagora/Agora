/**
 * Line Item Parser - Robust parsing of natural language materials into structured line items
 * Handles spelled numbers, plural units, conjunctions, and common patterns
 */

export interface ParsedLineItem {
  qty: number | null;
  unit: string | null;
  name: string;
  raw: string;
}

/**
 * Convert spelled numbers to digits
 */
function normalizeSpelledNumbers(text: string): string {
  const numberMap: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
    thirteen: "13",
    fourteen: "14",
    fifteen: "15",
    sixteen: "16",
    seventeen: "17",
    eighteen: "18",
    nineteen: "19",
    twenty: "20",
    thirty: "30",
    forty: "40",
    fifty: "50",
    sixty: "60",
    seventy: "70",
    eighty: "80",
    ninety: "90",
    hundred: "100",
  };

  let normalized = text.toLowerCase();
  
  // Replace spelled numbers (case-insensitive, whole word)
  for (const [word, digit] of Object.entries(numberMap)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    normalized = normalized.replace(regex, digit);
  }

  return normalized;
}

/**
 * Normalize unit names (handle plurals and variations)
 */
function normalizeUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    // Plural -> singular
    bundles: "BUNDLE",
    bundle: "BUNDLE",
    boxes: "BOX",
    box: "BOX",
    sheets: "SHEET",
    sheet: "SHEET",
    pieces: "PC",
    piece: "PC",
    pcs: "PC",
    rolls: "ROLL",
    roll: "ROLL",
    gallons: "GAL",
    gallon: "GAL",
    gals: "GAL",
    pounds: "LB",
    pound: "LB",
    lbs: "LB",
    tons: "TON",
    ton: "TON",
    feet: "FT",
    foot: "FT",
    ft: "FT",
    square: "SQFT",
    squares: "SQFT",
    sqft: "SQFT",
    "sq ft": "SQFT",
    "square feet": "SQFT",
    "square foot": "SQFT",
    linear: "LF",
    lf: "LF",
    yards: "YD",
    yard: "YD",
    yd: "YD",
    each: "EA",
    ea: "EA",
    bags: "BAG",
    bag: "BAG",
  };

  const normalized = unit.toLowerCase().trim();
  return unitMap[normalized] || unit.toUpperCase();
}

/**
 * Split text into potential line items by commas, conjunctions, etc.
 */
function splitIntoItems(text: string): string[] {
  // Normalize conjunctions and separators
  let normalized = text
    .replace(/\s*&\s*/g, ",")
    .replace(/\s*\+\s*/g, ",")
    .replace(/\s+and\s+/gi, ",")
    .replace(/\s*;\s*/g, ",");

  // Split on commas
  const parts = normalized.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

  // Filter out common stop words that aren't items
  const stopWords = ["and", "&", "+", "the", "a", "an"];
  return parts.filter((part) => {
    const lower = part.toLowerCase().trim();
    return lower.length > 0 && !stopWords.includes(lower);
  });
}

/**
 * Parse a single item string into structured data
 */
function parseSingleItem(itemText: string): ParsedLineItem {
  const raw = itemText.trim();
  if (!raw) {
    return { qty: null, unit: null, name: "", raw: "" };
  }

  const normalized = normalizeSpelledNumbers(raw);

  // Pattern 1: "1 2x4" or "10 2x6" (quantity + dimension)
  const pattern1 = /^(\d+)\s+(\d+)\s*(x|X)\s*(\d+)(?:\s+(.+))?$/;
  const match1 = normalized.match(pattern1);
  if (match1) {
    const dim = `${match1[2]}x${match1[4]}`;
    return {
      qty: parseInt(match1[1], 10),
      unit: null,
      name: match1[5] ? `${dim} ${match1[5].trim()}` : dim,
      raw,
    };
  }

  // Pattern 2: "10 bundles of shingles" or "10 bundles shingles"
  const pattern2 = /^(\d+)\s+(bundle|bundles|box|boxes|sheet|sheets|roll|rolls|gallon|gallons|gal|gals|lb|lbs|pound|pounds|ton|tons|ft|feet|sqft|sq\s*ft|square|squares|lf|linear|yd|yard|yards|ea|each|bag|bags|pc|pcs|piece|pieces)\s+(?:of\s+)?(.+)$/i;
  const match2 = normalized.match(pattern2);
  if (match2) {
    return {
      qty: parseInt(match2[1], 10),
      unit: normalizeUnit(match2[2]),
      name: match2[3]?.trim() || "",
      raw,
    };
  }

  // Pattern 3: "10 shingles" (quantity + name, no unit)
  const pattern3 = /^(\d+)\s+(.+)$/;
  const match3 = normalized.match(pattern3);
  if (match3) {
    const name = match3[2].trim();
    // Check if name starts with a unit-like word
    const unitMatch = name.match(/^(bundle|bundles|box|boxes|sheet|sheets|roll|rolls|gallon|gallons|gal|gals|lb|lbs|pound|pounds|ton|tons|ft|feet|sqft|sq\s*ft|square|squares|lf|linear|yd|yard|yards|ea|each|bag|bags|pc|pcs|piece|pieces)\s+(?:of\s+)?(.+)$/i);
    if (unitMatch) {
      return {
        qty: parseInt(match3[1], 10),
        unit: normalizeUnit(unitMatch[1]),
        name: unitMatch[2]?.trim() || "",
        raw,
      };
    }
    return {
      qty: parseInt(match3[1], 10),
      unit: null,
      name,
      raw,
    };
  }

  // Pattern 4: "2x4" or "2x6" (lumber dimensions, no quantity)
  const pattern4 = /^(\d+)\s*(x|X)\s*(\d+)(?:\s+(.+))?$/;
  const match4 = normalized.match(pattern4);
  if (match4) {
    const dim = `${match4[1]}x${match4[3]}`;
    return {
      qty: null,
      unit: null,
      name: match4[4] ? `${dim} ${match4[4].trim()}` : dim,
      raw,
    };
  }

  // Pattern 5: Just a name (no quantity or unit)
  return {
    qty: null,
    unit: null,
    name: raw,
    raw,
  };
}

/**
 * Parse line items from natural language input
 */
export function parseLineItems(input: string): ParsedLineItem[] {
  if (!input || typeof input !== "string") {
    return [];
  }

  // Split into potential items
  const itemStrings = splitIntoItems(input);

  // Parse each item
  const parsed: ParsedLineItem[] = [];
  for (const itemStr of itemStrings) {
    const item = parseSingleItem(itemStr);
    // Only add if it has a meaningful name (not just stop words or empty)
    if (item.name && item.name.trim().length > 0) {
      // Filter out items that are just conjunctions or stop words
      const lowerName = item.name.toLowerCase().trim();
      const isStopWord = ["and", "&", "+", "the", "a", "an", "of"].includes(lowerName);
      if (!isStopWord) {
        parsed.push(item);
      }
    }
  }

  return parsed;
}

