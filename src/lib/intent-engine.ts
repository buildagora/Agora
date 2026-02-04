/**
 * Intent Engine V1 - Rule-based classification for buyer conversations
 * Determines urgency, price sensitivity, complexity, and recommended channel
 */

import type {
  Urgency,
  PriceSensitivity,
  Complexity,
  RecommendedChannel,
  IntentAssessment,
} from "./types";

export interface IntentInput {
  category?: string;
  fulfillment?: "PICKUP" | "DELIVERY" | string;
  needBy?: string; // ISO date string or parseable date
  address?: string;
  lineItems?: Array<{
    description: string;
    unit: string;
    quantity: number;
  }>;
  notes?: string;
}

/**
 * Parse a date string and return days until that date
 * Returns null if parsing fails
 */
function parseDaysUntil(needBy?: string): number | null {
  if (!needBy) return null;

  try {
    const targetDate = new Date(needBy);
    if (isNaN(targetDate.getTime())) return null;

    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return null;
  }
}

/**
 * Derive intent assessment from conversation state
 */
export function deriveIntent(input: IntentInput): IntentAssessment {
  const rationale: string[] = [];
  let urgency: Urgency = "medium";
  let priceSensitivity: PriceSensitivity = "medium";
  let complexity: Complexity = "simple";
  let recommendedChannel: RecommendedChannel = "rfq";

  // Parse needBy date
  const daysUntil = parseDaysUntil(input.needBy);

  // Determine Urgency
  if (daysUntil !== null) {
    if (daysUntil <= 2) {
      urgency = "high";
      rationale.push("Needed within 48 hours");
    } else if (daysUntil <= 7) {
      urgency = "medium";
      rationale.push(`Needed in ${daysUntil} days`);
    } else {
      urgency = "low";
      rationale.push(`Needed in ${daysUntil} days`);
    }
  } else if (input.needBy) {
    rationale.push("Date unclear — assuming normal urgency");
  }

  // Determine Complexity
  const validLineItems = input.lineItems?.filter(item => item.description && item.quantity > 0) || [];
  const lineItemCount = validLineItems.length;
  const notesLength = input.notes?.length || 0;
  const notesLower = (input.notes || "").toLowerCase();

  const complexityKeywords = [
    "spec",
    "submittal",
    "engineer",
    "alternatives",
    "match",
    "equivalent",
    "code",
    "compliance",
    "certification",
    "approval",
  ];

  const hasComplexityKeywords = complexityKeywords.some((keyword) =>
    notesLower.includes(keyword)
  );

  if (
    lineItemCount >= 6 ||
    notesLength > 180 ||
    hasComplexityKeywords
  ) {
    complexity = "complex";
    if (lineItemCount >= 6) {
      rationale.push(`${lineItemCount} line items — complex order`);
    }
    if (notesLength > 180) {
      rationale.push("Detailed requirements");
    }
    if (hasComplexityKeywords) {
      rationale.push("Technical specifications required");
    }
  } else {
    rationale.push("Straightforward request");
  }

  // Determine Price Sensitivity
  const priceKeywords = [
    "cheapest",
    "best price",
    "price match",
    "competitive",
    "shop around",
    "budget",
    "low cost",
    "affordable",
  ];

  const hasPriceKeywords = priceKeywords.some((keyword) =>
    notesLower.includes(keyword)
  );

  if (hasPriceKeywords) {
    priceSensitivity = "high";
    rationale.push("Price-sensitive request");
  } else {
    priceSensitivity = "medium";
  }

  // If urgency is high, cap price sensitivity at medium
  if (urgency === "high" && priceSensitivity === "high") {
    priceSensitivity = "medium";
    rationale.push("Urgent need prioritizes speed over price");
  }

  // Determine Recommended Channel
  const uncertaintyKeywords = [
    "not sure",
    "recommend",
    "what do I need",
    "help me choose",
    "suggest",
    "advice",
    "guidance",
    "don't know",
  ];

  const hasUncertainty = uncertaintyKeywords.some((keyword) =>
    notesLower.includes(keyword)
  );

  const hasLineItems = lineItemCount > 0;
  const hasCategory = !!input.category;

  if (urgency === "high") {
    recommendedChannel = "fast_track";
    rationale.push("Fast-track for urgent delivery");
  } else if (priceSensitivity === "high" && complexity === "simple") {
    recommendedChannel = "reverse_auction";
    rationale.push("Competitive bidding for best price");
  } else if (complexity === "simple" && hasLineItems) {
    recommendedChannel = "rfq";
    rationale.push("Standard RFQ process");
  } else if (!hasLineItems && hasUncertainty) {
    recommendedChannel = "advice_only";
    rationale.push("Buyer needs guidance before requesting quotes");
  } else if (hasCategory && !hasLineItems && !hasUncertainty) {
    recommendedChannel = "supplier_discovery";
    rationale.push("Supplier discovery recommended");
  } else {
    recommendedChannel = "rfq";
    rationale.push("Standard RFQ process");
  }

  return {
    urgency,
    priceSensitivity,
    complexity,
    recommendedChannel,
    rationale,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get human-readable label for recommended channel
 */
export function getChannelLabel(channel: RecommendedChannel): string {
  const labels: Record<RecommendedChannel, string> = {
    advice_only: "Advice",
    supplier_discovery: "Supplier Discovery",
    direct_quote: "Direct Quote",
    rfq: "RFQ",
    reverse_auction: "Competitive Bid",
    fast_track: "Fast-track",
  };
  return labels[channel];
}

