/**
 * Canonical supplier category taxonomy.
 *
 * SupplierCategoryLink.categoryId and Supplier.primaryCategoryId use canonical
 * lowercase ids from @/lib/categoryIds. Legacy Supplier.category and crawl
 * capability ids are normalized through the alias tables below.
 */

import {
  categoryIdToLabel,
  labelToCategoryId,
  type CategoryId,
} from "@/lib/categoryIds";

export const CANONICAL_CATEGORY_IDS = Object.keys(
  categoryIdToLabel
) as CategoryId[];

const CANONICAL_SET = new Set<string>(CANONICAL_CATEGORY_IDS);

/**
 * Legacy `Supplier.category` values (uppercase labels, mixed ids) → canonical id.
 */
export const LEGACY_SUPPLIER_CATEGORY_ALIASES: Record<string, CategoryId> = {
  roofing: "roofing",
  ROOFING: "roofing",
  hvac: "hvac",
  HVAC: "hvac",
  electrical: "electrical",
  ELECTRICAL: "electrical",
  plumbing: "plumbing",
  PLUMBING: "plumbing",
  drywall: "drywall",
  DRYWALL: "drywall",
  concrete: "concrete_cement",
  concrete_cement: "concrete_cement",
  lumber: "lumber_siding",
  lumber_siding: "lumber_siding",
  LUMBER_SIDING: "lumber_siding",
  insulation: "insulation",
  INSULATION: "insulation",
  steel_metal: "steel_metal",
  STEEL_METAL: "steel_metal",
  flooring: "flooring",
  FLOORING: "flooring",
  tile_stone: "tile_stone",
  TILE_STONE: "tile_stone",
  paint: "paint",
  PAINT: "paint",
  windows_doors: "windows_doors",
  WINDOWS_DOORS: "windows_doors",
  cabinets_countertops: "cabinets_countertops",
  CABINETS_COUNTERTOPS: "cabinets_countertops",
  hardware_fasteners: "hardware_fasteners",
  HARDWARE_FASTENERS: "hardware_fasteners",
  tools_equipment: "tools_equipment",
  TOOLS_EQUIPMENT: "tools_equipment",
  fencing: "fencing",
  FENCING: "fencing",
  landscaping: "landscaping",
  LANDSCAPING: "landscaping",
  decking_railing: "decking_railing",
  DECKING_RAILING: "decking_railing",
  gutter_drainage: "gutter_drainage",
  GUTTER_DRAINAGE: "gutter_drainage",
  glass_glazing: "glass_glazing",
  GLASS_GLAZING: "glass_glazing",
  brick: "brick",
  BRICK: "brick",
  masonry: "brick",
  home_improvement: "lumber_siding",
  HOME_IMPROVEMENT: "lumber_siding",
  other: "tools_equipment",
  OTHER: "tools_equipment",
};

/**
 * Non-canonical SupplierCapability.categoryId → canonical marketplace id.
 */
export const CAPABILITY_CATEGORY_ALIASES: Record<string, CategoryId> = {
  commercial_roofing: "roofing",
  roofing_accessories: "roofing",
  building_products: "roofing",
  windows: "windows_doors",
  kitchens: "cabinets_countertops",
  lumber: "lumber_siding",
  coatings: "paint",
  mechanical: "hvac",
  fasteners: "hardware_fasteners",
  hardware: "hardware_fasteners",
};

/**
 * When a supplier has multiple category links, prefer the most specific /
 * business-relevant id (lower index wins).
 */
export const PRIMARY_LINK_PRIORITY: CategoryId[] = [
  "roofing",
  "brick",
  "lumber_siding",
  "plumbing",
  "hvac",
  "electrical",
  "drywall",
  "concrete_cement",
  "insulation",
  "steel_metal",
  "flooring",
  "tile_stone",
  "paint",
  "windows_doors",
  "cabinets_countertops",
  "hardware_fasteners",
  "tools_equipment",
  "fencing",
  "landscaping",
  "decking_railing",
  "gutter_drainage",
  "glass_glazing",
];

/** Exact supplier id → primary category (curated catalog). */
export const SUPPLIER_PRIMARY_OVERRIDES: Record<string, CategoryId> = {
  abc_supply_hsv: "roofing",
  srs_hsv: "roofing",
  cmn90dbjr000404ldzhcsquav: "roofing",
  lansing_hsv: "roofing",
  gulfeagle_hsv: "roofing",
  grainger_hsv: "tools_equipment",
  ferguson_plumbing_hsv: "plumbing",
  ferguson_hvac_hsv: "hvac",
  winsupply_hsv: "plumbing",
  winsupply_idea_center_hsv: "cabinets_countertops",
};

/** Id prefix → primary when no exact override. */
export const SUPPLIER_PRIMARY_PREFIX_OVERRIDES: Array<{
  prefix: string;
  categoryId: CategoryId;
}> = [
  { prefix: "home_depot", categoryId: "lumber_siding" },
  { prefix: "lowes", categoryId: "lumber_siding" },
];

/**
 * Normalize any category string to a canonical CategoryId, or null if unknown.
 */
export function normalizeToCanonicalCategoryId(
  raw: string | null | undefined
): CategoryId | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  if (CANONICAL_SET.has(lower)) {
    return lower as CategoryId;
  }

  if (LEGACY_SUPPLIER_CATEGORY_ALIASES[trimmed]) {
    return LEGACY_SUPPLIER_CATEGORY_ALIASES[trimmed];
  }
  if (LEGACY_SUPPLIER_CATEGORY_ALIASES[lower]) {
    return LEGACY_SUPPLIER_CATEGORY_ALIASES[lower];
  }
  if (CAPABILITY_CATEGORY_ALIASES[lower]) {
    return CAPABILITY_CATEGORY_ALIASES[lower];
  }

  const fromLabel = labelToCategoryId[trimmed as keyof typeof labelToCategoryId];
  if (fromLabel) return fromLabel;

  const upper = trimmed.toUpperCase();
  if (LEGACY_SUPPLIER_CATEGORY_ALIASES[upper]) {
    return LEGACY_SUPPLIER_CATEGORY_ALIASES[upper];
  }

  return null;
}

export function resolveSupplierPrimaryOverride(
  supplierId: string
): CategoryId | null {
  if (SUPPLIER_PRIMARY_OVERRIDES[supplierId]) {
    return SUPPLIER_PRIMARY_OVERRIDES[supplierId];
  }
  for (const { prefix, categoryId } of SUPPLIER_PRIMARY_PREFIX_OVERRIDES) {
    if (supplierId.startsWith(prefix)) return categoryId;
  }
  return null;
}

/**
 * Pick primary category from normalized link ids and optional legacy field.
 */
export function pickPrimaryCategoryId(args: {
  supplierId: string;
  linkCategoryIds: string[];
  legacyCategory?: string | null;
  capabilityCategoryCounts?: Record<string, number>;
}): CategoryId {
  const override = resolveSupplierPrimaryOverride(args.supplierId);
  if (override) return override;

  const normalizedLinks = args.linkCategoryIds
    .map((id) => normalizeToCanonicalCategoryId(id))
    .filter((id): id is CategoryId => id != null);

  if (normalizedLinks.length > 0) {
    const unique = [...new Set(normalizedLinks)];
    for (const preferred of PRIMARY_LINK_PRIORITY) {
      if (unique.includes(preferred)) return preferred;
    }
    return unique[0]!;
  }

  if (args.capabilityCategoryCounts) {
    let best: CategoryId | null = null;
    let bestCount = 0;
    for (const [rawId, count] of Object.entries(args.capabilityCategoryCounts)) {
      const canonical = normalizeToCanonicalCategoryId(rawId);
      if (!canonical || count <= bestCount) continue;
      bestCount = count;
      best = canonical;
    }
    if (best) return best;
  }

  const fromLegacy = normalizeToCanonicalCategoryId(args.legacyCategory);
  if (fromLegacy) return fromLegacy;

  return "tools_equipment";
}

export function isCanonicalCategoryId(id: string): id is CategoryId {
  return CANONICAL_SET.has(id);
}
