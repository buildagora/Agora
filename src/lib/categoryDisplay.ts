/**
 * Category Display Utilities
 * Display-only helpers for UI. Uses @/lib/categoryIds as canonical source.
 * DO NOT use for routing logic - use @/lib/categoryIds directly.
 */

import { categoryIdToLabel, labelToCategoryId, type CategoryId } from "./categoryIds";

/**
 * Material category option for UI dropdowns
 */
export type CategoryOption = {
  id: CategoryId;
  label: string;
};

/** Same order as keys in `categoryIdToLabel` — single source of truth. */
export const CATEGORY_IDS = Object.keys(categoryIdToLabel) as CategoryId[];

/**
 * Category labels map (derived from canonical categoryIdToLabel)
 * For backward compatibility with old categories.ts
 */
export const CATEGORY_LABELS: Record<CategoryId, string> = categoryIdToLabel as Record<CategoryId, string>;

/**
 * Material categories array for UI dropdowns (legacy string[] for backwards compatibility)
 * Contains display labels as strings
 */
export const MATERIAL_CATEGORIES: string[] = CATEGORY_IDS.map((id) =>
  categoryIdToLabel[id]
);

/** Dropdown rows: `{ id, label }[]` derived only from `CATEGORY_IDS` / `categoryIdToLabel`. */
export const CATEGORY_OPTIONS: CategoryOption[] = CATEGORY_IDS.map((id) => ({
  id,
  label: categoryIdToLabel[id],
}));

/** Buyer UI uses the full canonical category list (same as `CATEGORY_IDS`). */
export const BUYER_LIVE_CATEGORY_IDS: CategoryId[] = [...CATEGORY_IDS];

/** Alias of `CATEGORY_OPTIONS` — same ids and labels as `BUYER_LIVE_CATEGORY_IDS`. */
export const BUYER_CATEGORY_OPTIONS: CategoryOption[] = BUYER_LIVE_CATEGORY_IDS.map((id) => ({
  id,
  label: categoryIdToLabel[id],
}));

/**
 * Material category IDs array (string IDs only)
 * Useful when only IDs are needed, not full objects
 */
export const MATERIAL_CATEGORY_IDS: CategoryId[] = [...CATEGORY_IDS];

/**
 * Normalize category input with confidence scoring
 * Returns categoryId, confidence level, and normalized input
 * DISPLAY-ONLY: For UI input normalization, not routing
 */
export function normalizeCategoryInput(
  input: string
): {
  categoryId: CategoryId | null;
  confidence: "exact" | "alias" | "fuzzy" | "none";
  normalized: string;
} {
  if (!input || typeof input !== "string") {
    return { categoryId: null, confidence: "none", normalized: "" };
  }
  
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  
  // Exact match on label
  for (const [id, displayLabel] of Object.entries(categoryIdToLabel)) {
    if (displayLabel.toLowerCase() === lower) {
      return {
        categoryId: id as CategoryId,
        confidence: "exact",
        normalized: displayLabel,
      };
    }
  }
  
  // Exact match on ID
  if (CATEGORY_IDS.includes(lower as CategoryId)) {
    return {
      categoryId: lower as CategoryId,
      confidence: "exact",
      normalized: categoryIdToLabel[lower as CategoryId],
    };
  }
  
  // Alias matching (common variations and legacy ids)
  const aliases: Record<string, CategoryId> = {
    mechanical: "hvac",
    hvac: "hvac",
    heating: "hvac",
    cooling: "hvac",
    ac: "hvac",
    "air conditioning": "hvac",
    roof: "roofing",
    roofing: "roofing",
    plumb: "plumbing",
    plumbing: "plumbing",
    electrical: "electrical",
    electric: "electrical",
    lumber: "lumber_siding",
    siding: "lumber_siding",
    "lumber / siding": "lumber_siding",
    "lumber/siding": "lumber_siding",
    concrete: "concrete_cement",
    cement: "concrete_cement",
    concrete_cement: "concrete_cement",
    masonry: "brick",
    brick: "brick",
  };
  
  if (aliases[lower]) {
    return {
      categoryId: aliases[lower],
      confidence: "alias",
      normalized: categoryIdToLabel[aliases[lower]],
    };
  }
  
  // Fuzzy matching (partial string match)
  for (const [id, displayLabel] of Object.entries(categoryIdToLabel)) {
    if (displayLabel.toLowerCase().includes(lower) || lower.includes(displayLabel.toLowerCase())) {
      return {
        categoryId: id as CategoryId,
        confidence: "fuzzy",
        normalized: displayLabel,
      };
    }
  }
  
  // No match
  return { categoryId: null, confidence: "none", normalized: trimmed };
}
