/**
 * Shared type models for notification system
 */

export interface Supplier {
  id: string;
  email: string;
  name?: string;
  categories: string[]; // Legacy: display labels (e.g., "Roofing")
  categoryIds?: string[]; // NEW: canonical IDs (e.g., "roofing") - preferred
  isEmailVerified?: boolean;
  unsubscribed?: boolean;
  // Computed: isActive = !unsubscribed
  isActive?: boolean; // Computed field for convenience
}

export interface RFQ {
  id: string;
  buyerName: string;
  category: string;
  title: string;
  description?: string;
  createdAt: string;
  dueAt?: string;
  location?: string;
  urlPath?: string;
}

/**
 * Intent Engine Types
 */
export type Urgency = "low" | "medium" | "high";
export type PriceSensitivity = "low" | "medium" | "high";
export type Complexity = "simple" | "complex";
export type RecommendedChannel =
  | "advice_only"
  | "supplier_discovery"
  | "direct_quote"
  | "rfq"
  | "reverse_auction"
  | "fast_track";

export interface IntentAssessment {
  urgency: Urgency;
  priceSensitivity: PriceSensitivity;
  complexity: Complexity;
  recommendedChannel: RecommendedChannel;
  rationale: string[];
  updatedAt: string;
}
