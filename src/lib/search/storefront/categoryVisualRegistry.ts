import { normalizeStorefrontLabel } from "./normalizeStorefrontLabel";

/** Parent category slug for inheritance when exact label is missing. */
const CATEGORY_PARENT: Record<string, string> = {
  "asphalt shingles": "roofing",
  "steep slope roofing": "roofing",
  "low slope roofing": "roofing",
  "metal roofing": "roofing",
  "roofing accessories": "roofing",
  "porcelain tile": "tile",
  "ceramic tile": "tile",
  "ceramic mosaic": "tile",
  "ceramic wall tile": "tile",
  "porcelain mosaic": "tile",
  "tile stone": "tile",
  "tile & stone": "tile",
  "hardwood flooring": "flooring",
  "luxury vinyl plank": "flooring",
  carpet: "flooring",
  laminate: "flooring",
  "interior latex paint": "paint",
  "industrial coatings": "paint",
  "automotive refinish paint": "paint",
  "paint coatings": "paint",
  "hvac equipment": "hvac",
  "residential fencing": "fencing",
  "welded wire fencing": "fencing",
  "composite fencing": "fencing",
  "ornamental aluminum fencing": "fencing",
  "windows doors": "windows",
  "windows & doors": "windows",
  "entrance doors": "doors",
  "patio doors": "doors",
  "electrical distribution equipment": "electrical",
  nails: "fasteners",
  anchors: "fasteners",
  "building materials": "lumber",
  lumber: "lumber",
  "lumber siding": "lumber",
};

/** Direct category slug mapping. */
const CATEGORY_VISUAL_ALIASES: Record<string, string> = {
  roofing: "roofing",
  "asphalt shingles": "asphalt-shingles",
  plumbing: "plumbing",
  pipe: "pipe",
  fasteners: "fasteners",
  screws: "screws",
  bolts: "bolts",
  paint: "paint",
  tile: "tile",
  flooring: "flooring",
  hardwood: "flooring",
  laminate: "flooring",
  hvac: "hvac",
  electrical: "electrical",
  lumber: "lumber",
  drywall: "drywall",
  siding: "siding",
  windows: "windows",
  doors: "doors",
  fencing: "fencing",
  concrete: "concrete",
  steel: "steel",
  insulation: "insulation",
  landscaping: "landscaping",
  nails: "fasteners",
  anchors: "fasteners",
  "building materials": "lumber",
};

function slugForLabel(normalized: string): string | null {
  if (CATEGORY_VISUAL_ALIASES[normalized]) {
    return CATEGORY_VISUAL_ALIASES[normalized]!;
  }
  const parent = CATEGORY_PARENT[normalized];
  if (parent) {
    return CATEGORY_VISUAL_ALIASES[parent] ?? parent;
  }
  for (const [needle, parentSlug] of Object.entries(CATEGORY_PARENT)) {
    if (normalized.includes(needle) || needle.includes(normalized)) {
      return CATEGORY_VISUAL_ALIASES[parentSlug] ?? parentSlug;
    }
  }
  return null;
}

export function lookupCategoryVisual(
  label: string
): { src: string; key: string } | null {
  const normalized = normalizeStorefrontLabel(label);
  const slug = slugForLabel(normalized);
  if (!slug) return null;
  return { src: `/storefront/categories/${slug}.svg`, key: slug };
}

export function listRegisteredCategorySlugs(): string[] {
  return [...new Set(Object.values(CATEGORY_VISUAL_ALIASES))].sort();
}
