import type { CategoryId } from "@/lib/categoryIds";
import type { ExtractionStrategy } from "@prisma/client";

/** Default probe query per canonical supplier category (Phase 9.5 Wave 1). */
export const CATEGORY_PROBE_QUERIES: Record<CategoryId, string> = {
  roofing: "shingles",
  hvac: "furnace",
  electrical: "breaker",
  plumbing: "pvc pipe",
  drywall: "drywall",
  concrete_cement: "concrete",
  lumber_siding: "lumber",
  insulation: "insulation",
  steel_metal: "steel",
  flooring: "vinyl plank flooring",
  tile_stone: "tile",
  paint: "interior paint",
  windows_doors: "exterior door",
  cabinets_countertops: "countertops",
  hardware_fasteners: "screws",
  tools_equipment: "power drill",
  fencing: "fence",
  landscaping: "landscaping",
  decking_railing: "decking",
  gutter_drainage: "gutter",
  glass_glazing: "glass",
  brick: "concrete block",
};

/** Strategy fallback when category and supplier heuristics do not apply. */
export const STRATEGY_PROBE_QUERIES: Partial<Record<ExtractionStrategy, string>> = {
  PUBLIC_API: "tile",
  PLATFORM_API: "filter",
  SCHEMA_OR_SITEMAP: "pipe",
  HTML_SCRAPE: "lumber",
  SERP_PRODUCT_ENGINE: "drill",
  SERP_SITE_ORGANIC: "building materials",
  PROBABILISTIC_CATEGORY_PROFILE: "parts",
};

/** Known high-signal overrides from live validation cohorts. */
export const SUPPLIER_PROBE_QUERY_OVERRIDES: Record<string, string> = {
  floor_decor_hsv: "tile",
  ppg_paint_hsv: "interior paint",
  johnstone_hsv: "air filter",
  lennox_hsv: "furnace",
  abc_supply_hsv: "shingles",
  gulfeagle_hsv: "shingles",
  trane_supply_hsv: "hvac",
  wittichen_hsv: "condenser",
  ferguson_plumbing_hsv: "pvc pipe",
  home_depot_hsv: "drill",
  lowes_hsv: "paint",
  grainger_hsv: "safety gloves",
  srs_hsv: "shingles",
  lansing_hsv: "lumber",
  ma_supply_hsv: "lumber",
};

const SUPPLIER_ID_PROBE_RULES: { re: RegExp; query: string }[] = [
  { re: /lumber|lansing|ma_supply|wilson_lumber|city_lumber|84_lumber|acme_brick/, query: "lumber" },
  { re: /glass/, query: "glass" },
  { re: /pipe|plumbing|ferguson/, query: "pvc pipe" },
  { re: /electric|conduit|wire|graybar|mayer_electric/, query: "electrical wire" },
  { re: /roof|shingle|material|capitol|metal_roof/, query: "roofing shingles" },
  { re: /paint|ppg|calhoun|coatings|finishes|sw_/, query: "interior paint" },
  { re: /hvac|trane|lennox|johnstone|re_michel|mingledorff/, query: "furnace" },
  { re: /floor|tile|decor|daltile|carpet/, query: "vinyl plank flooring" },
  { re: /door|window/, query: "exterior door" },
  { re: /stone|brick|masonry|concrete|block/, query: "concrete block" },
  { re: /tool|harbor|grainger|fastener|tractor/, query: "power drill" },
  { re: /fence|gutter/, query: "fence" },
  { re: /steel|metal(?!_roof)/, query: "steel" },
];

export type ResolveSupplierProbeQueryInput = {
  supplierId: string;
  primaryStrategy?: ExtractionStrategy | string;
  primaryCategoryId?: CategoryId | null;
};

/**
 * Category-aware default probe query for audits and diagnostics.
 * Avoids generic "supplies" — uses overrides, category, supplierId tokens, then strategy.
 */
export function resolveSupplierProbeQuery(
  input: ResolveSupplierProbeQueryInput
): string {
  const override = SUPPLIER_PROBE_QUERY_OVERRIDES[input.supplierId];
  if (override) return override;

  if (input.primaryCategoryId && CATEGORY_PROBE_QUERIES[input.primaryCategoryId]) {
    return CATEGORY_PROBE_QUERIES[input.primaryCategoryId];
  }

  const id = input.supplierId.toLowerCase();
  for (const rule of SUPPLIER_ID_PROBE_RULES) {
    if (rule.re.test(id)) return rule.query;
  }

  const strategy = input.primaryStrategy;
  if (strategy && STRATEGY_PROBE_QUERIES[strategy as ExtractionStrategy]) {
    return STRATEGY_PROBE_QUERIES[strategy as ExtractionStrategy]!;
  }

  return "building materials";
}
