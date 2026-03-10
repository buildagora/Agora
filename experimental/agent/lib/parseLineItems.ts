/**
 * Deterministic Line Items Parser (Offline Mode)
 * Parses materials and quantities from user text without LLM
 */

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unit: string;
}

/**
 * Map common roofing units to standard unit codes
 */
function normalizeUnit(unitText: string): string {
  const lower = unitText.toLowerCase().trim();
  
  // Roofing units
  if (lower.match(/\b(square|sq|sqs)\b/)) return "SQ";
  if (lower.match(/\b(bundle|bundles|bdl)\b/)) return "BUNDLE";
  if (lower.match(/\b(roll|rolls)\b/)) return "ROLL";
  if (lower.match(/\b(stick|sticks)\b/)) return "STICK";
  if (lower.match(/\b(sheet|sheets|sh)\b/)) return "SHEET";
  if (lower.match(/\b(piece|pieces|pc|pcs)\b/)) return "PC";
  if (lower.match(/\b(pound|pounds|lb|lbs)\b/)) return "LB";
  if (lower.match(/\b(ton|tons)\b/)) return "TON";
  if (lower.match(/\b(sq\s*ft|sqft|square\s*feet)\b/)) return "SQFT";
  
  // Default: return uppercase version
  return unitText.toUpperCase().trim() || "EA";
}

/**
 * Parse line items from user message text
 * Handles patterns like:
 * - "30 squares of shingles"
 * - "10 OSB"
 * - "30 squares shingles and 10 OSB"
 * - "30 squares OC Duration shingles"
 */
export function parseLineItemsFromText(message: string): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  
  // Split by common separators: "and", ",", ";"
  const parts = message.split(/\s+(?:and|,|;)\s+/i);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Pattern 1: "X [unit] of [material]" (e.g., "30 squares of shingles", "100 bundles of oakridge onyx black shingles")
    let match = trimmed.match(/^(\d+(?:\.\d+)?)\s+([a-z]+(?:\s+[a-z]+)?)\s+of\s+(.+)$/i);
    if (match) {
      const [, qtyStr, unitStr, material] = match;
      const quantity = parseFloat(qtyStr);
      if (!isNaN(quantity) && quantity > 0 && material) {
        // Capitalize first letter of each word in material description
        const description = material.trim().split(/\s+/).map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(" ");
        
        items.push({
          quantity,
          unit: normalizeUnit(unitStr),
          description,
        });
        continue;
      }
    }
    
    // Pattern 2: "X [unit] [material]" (e.g., "30 squares shingles", "30 squares OC Duration shingles", "100 bundles oakridge onyx black shingles")
    match = trimmed.match(/^(\d+(?:\.\d+)?)\s+([a-z]+(?:\s+[a-z]+)?)\s+(.+)$/i);
    if (match) {
      const [, qtyStr, unitStr, material] = match;
      const quantity = parseFloat(qtyStr);
      // Check if unitStr looks like a unit (not part of material name)
      const unitLower = unitStr.toLowerCase();
      const isUnit = unitLower.match(/\b(square|sq|bundle|bundles|roll|stick|sheet|piece|pc|lb|ton|sqft)\b/);
      
      if (!isNaN(quantity) && quantity > 0 && material && isUnit) {
        // Capitalize first letter of each word in material description
        const description = material.trim().split(/\s+/).map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(" ");
        
        items.push({
          quantity,
          unit: normalizeUnit(unitStr),
          description,
        });
        continue;
      }
    }
    
    // Pattern 3: "X [material]" (e.g., "10 OSB", "30 shingles", "200 2x4s")
    // Enhanced to handle more material patterns
    match = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/i);
    if (match) {
      const [, qtyStr, material] = match;
      const quantity = parseFloat(qtyStr);
      const materialLower = material.toLowerCase();
      
      // Check if material looks like a material name (short abbreviation or contains material keywords)
      const isMaterial = material.length <= 20 || 
                         materialLower.match(/\b(shingle|osb|plywood|metal|tpo|epdm|membrane|nails|screws|underlayment|2x4|2\s*x\s*4|drywall|insulation|siding|hardie|lumber|board|material)\b/);
      
      if (!isNaN(quantity) && quantity > 0 && material && isMaterial) {
        // Try to infer unit from material name or common patterns
        let unit = "EA"; // Default fallback
        if (materialLower.includes("square") || materialLower.includes("sq")) {
          unit = "SQ";
        } else if (materialLower.includes("bundle")) {
          unit = "BUNDLE";
        } else if (materialLower.includes("sheet") || materialLower.includes("osb") || materialLower.includes("plywood") || materialLower.includes("drywall")) {
          unit = "SHEET";
        } else if (materialLower.includes("roll")) {
          unit = "ROLL";
        } else if (materialLower.includes("shingle")) {
          unit = "SQ"; // Shingles typically measured in squares
        } else if (materialLower.match(/\b(2x4|2\s*x\s*4|lumber|board|stud)\b/)) {
          unit = "PC"; // Lumber/boards typically in pieces
        } else if (materialLower.includes("ft") || materialLower.includes("feet") || materialLower.includes("linear")) {
          unit = "FT"; // Linear feet
        }
        
        // Capitalize first letter of each word in material description
        const description = material.trim().split(/\s+/).map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(" ");
        
        items.push({
          quantity,
          unit,
          description,
        });
        continue;
      }
    }
  }
  
  // If no items found with separators, try parsing the whole message as a single item
  if (items.length === 0) {
    // Pattern: "X [unit] [material]" anywhere in message
    const globalMatch = message.match(/(\d+(?:\.\d+)?)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:of\s+)?([a-z][a-z\s\d-]*)/gi);
    if (globalMatch && globalMatch.length === 1) {
      // Only parse if there's exactly one match (likely a single item)
      const match = globalMatch[0];
      const itemMatch = match.match(/(\d+(?:\.\d+)?)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:of\s+)?(.+)$/i);
      if (itemMatch) {
        const [, qtyStr, unitStr, material] = itemMatch;
        const quantity = parseFloat(qtyStr);
        if (!isNaN(quantity) && quantity > 0 && material) {
          items.push({
            quantity,
            unit: normalizeUnit(unitStr),
            description: material.trim(),
          });
        }
      }
    }
  }
  
  return items;
}

