/**
 * Intent routing for agent turns
 * Deterministic first, optional LLM classifier second
 */

export type TurnMode = "advice" | "procurement";

export interface IntentResult {
  mode: TurnMode;
  confidence: number;
  rationale?: string;
}

/**
 * Deterministic procurement intent detection
 */
export function detectProcurementIntentDeterministic(message: string): boolean {
  const lower = message.toLowerCase().trim();
  
  // Explicit procurement keywords
  const explicitKeywords = [
    "quote", "price", "pricing", "order", "buy", "purchase", "send", "rfq", 
    "bid", "auction", "deliver", "delivery", "pickup", "pick up",
    "how much", "get me a quote", "can you quote", "place an order"
  ];
  
  if (explicitKeywords.some(keyword => lower.includes(keyword))) {
    return true;
  }
  
  // Quantity + item pattern (e.g., "30 squares OC Duration", "10 bundles shingles")
  // Look for: number + unit-like word + material noun
  const quantityPattern = /\d+\s+(squares?|bundles?|boxes?|pieces?|sheets?|rolls?|lbs?|tons?|sq\s*ft|sqft)/i;
  const materialHints = ["shingle", "roof", "metal", "lumber", "plywood", "drywall", "insulation", "pipe", "wire", "conduit"];
  
  if (quantityPattern.test(message) && materialHints.some(hint => lower.includes(hint))) {
    return true;
  }
  
  return false;
}

/**
 * Get turn mode from message and draft
 */
export function getTurnMode(
  message: string,
  input: { threadStateMode?: "ADVICE" | "PROCUREMENT" }
): TurnMode {
  // Authoritative: threadState.mode
  if (input.threadStateMode === "PROCUREMENT") {
    // Allow info questions without downgrading overall mode.
    return "procurement";
  }

  // Default to advice unless the user signals procurement.
  if (detectProcurementIntentDeterministic(message)) {
    return "procurement";
  }

  return "advice";
}
