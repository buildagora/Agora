/**
 * Category Normalization
 * Normalizes category input to canonical CategoryId format
 */

import type { CategoryId } from "@/lib/categoryIds";
import { categoryIdToLabel, labelToCategoryId } from "@/lib/categoryIds";

/**
 * Normalize category input to canonical CategoryId
 * - Case-insensitive matching
 * - Handles label variations (e.g., "lumber / siding" -> "lumber_siding")
 * - Returns null for invalid inputs
 */
export function normalizeCategory(input: string | null | undefined): CategoryId | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  // Normalize common variations
  const normalized = lower
    .replace(/\s*\/\s*/g, "_")  // "lumber / siding" -> "lumber_siding"
    .replace(/\s+/g, "_");      // "lumber siding" -> "lumber_siding"

  // Check if it's already a valid categoryId (case-insensitive)
  const categoryIds = Object.keys(categoryIdToLabel) as CategoryId[];
  for (const id of categoryIds) {
    if (id.toLowerCase() === normalized) {
      return id;
    }
  }

  // Check if it matches a label (case-insensitive)
  for (const [id, label] of Object.entries(categoryIdToLabel)) {
    if (label.toLowerCase() === lower || label.toLowerCase() === normalized) {
      return id as CategoryId;
    }
  }

  // Try labelToCategoryId lookup
  const categoryId = labelToCategoryId[lower as keyof typeof labelToCategoryId];
  if (categoryId) {
    return categoryId;
  }

  return null;
}

/**
 * Check if a seller serves a specific category
 * Handles both categoryId and label formats in sellerCategories array
 */
export function sellerServesCategory(
  sellerCategories: string[] | null | undefined,
  categoryId: CategoryId
): boolean {
  if (!sellerCategories || !Array.isArray(sellerCategories)) {
    return false;
  }

  // Check direct categoryId match
  if (sellerCategories.includes(categoryId)) {
    return true;
  }

  // Check label match (normalize each seller category and compare)
  const categoryLabel = categoryIdToLabel[categoryId];
  if (!categoryLabel) {
    return false;
  }

  for (const sellerCat of sellerCategories) {
    const normalized = normalizeCategory(sellerCat);
    if (normalized === categoryId) {
      return true;
    }
    // Also check label match (case-insensitive)
    if (typeof sellerCat === "string" && sellerCat.toLowerCase() === categoryLabel.toLowerCase()) {
      return true;
    }
  }

  return false;
}
export type CategoryNormalizationConfidence = "exact" | "alias" | "fuzzy" | "none";

export function normalizeCategoryInput(input: string | null | undefined): {
  categoryId: CategoryId | null;
  confidence: CategoryNormalizationConfidence;
  normalized: string | null; // display label
} {
  const raw = (typeof input === "string" ? input : "").trim();
  if (!raw) return { categoryId: null, confidence: "none", normalized: null };

  const lower = raw.toLowerCase();

  // 1) Exact (via existing normalizer)
  const exactId = normalizeCategory(raw);
  if (exactId) {
    return {
      categoryId: exactId,
      confidence: "exact",
      normalized: categoryIdToLabel[exactId] ?? raw,
    };
  }

  // 2) Alias (explicit common synonyms)
  const ALIASES: Record<string, CategoryId> = {
    mechanical: "hvac",
    hvac: "hvac",
    "a/c": "hvac",
    ac: "hvac",
    "air conditioning": "hvac",
  };

  const aliasId = ALIASES[lower];
  if (aliasId) {
    return {
      categoryId: aliasId,
      confidence: "alias",
      normalized: categoryIdToLabel[aliasId] ?? raw,
    };
  }

  // 3) Fuzzy (small typos)
  function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur: number[] = [i];
      const ca = a.charAt(i - 1);
      for (let j = 1; j <= b.length; j++) {
        const cb = b.charAt(j - 1);
        const ins = cur[j - 1] + 1;
        const del_ = prev[j] + 1;
        const sub = prev[j - 1] + (ca === cb ? 0 : 1);
        cur[j] = Math.min(ins, del_, sub);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const candidate = lower
    .replace(/\//g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let bestId: CategoryId | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [cid, label] of Object.entries(categoryIdToLabel)) {
    const idStr = cid.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
    const labStr = String(label)
      .toLowerCase()
      .replace(/[()]/g, " ")
      .replace(/\//g, " ")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const d1 = levenshtein(candidate, idStr);
    if (d1 < bestDist) {
      bestDist = d1;
      bestId = cid as CategoryId;
    }

    const d2 = levenshtein(candidate, labStr);
    if (d2 < bestDist) {
      bestDist = d2;
      bestId = cid as CategoryId;
    }
  }

  // Threshold: allow only small edits (covers "rofing" -> "roofing")
  if (bestId && bestDist <= 2) {
    return {
      categoryId: bestId,
      confidence: "fuzzy",
      normalized: categoryIdToLabel[bestId] ?? raw,
    };
  }

  return { categoryId: null, confidence: "none", normalized: null };
}
