// src/lib/categoryIds.ts

export const categoryIdToLabel = {
  roofing: "Roofing",
  hvac: "HVAC",
  electrical: "Electrical",
  plumbing: "Plumbing",
  drywall: "Drywall",
  concrete_cement: "Concrete",
  lumber_siding: "Lumber / Siding",
  insulation: "Insulation",
  steel_metal: "Steel & Metal",
  flooring: "Flooring",
  tile_stone: "Tile & Stone",
  paint: "Paint & Coatings",
  windows_doors: "Windows & Doors",
  cabinets_countertops: "Cabinets & Countertops",
  hardware_fasteners: "Fasteners & Hardware",
  tools_equipment: "Tools & Equipment",
  fencing: "Fencing",
  landscaping: "Landscaping & Outdoor",
  decking_railing: "Decking & Railing",
  gutter_drainage: "Gutters & Drainage",
  glass_glazing: "Glass & Glazing",
  brick: "Masonry",
} as const;

export type CategoryId = keyof typeof categoryIdToLabel;

type CategoryLabelValue = (typeof categoryIdToLabel)[CategoryId];

/** Exact inverse of `categoryIdToLabel` (one entry per canonical label). */
export const labelToCategoryId = Object.fromEntries(
  (Object.keys(categoryIdToLabel) as CategoryId[]).map((id) => [
    categoryIdToLabel[id],
    id,
  ])
) as { readonly [L in CategoryLabelValue]: CategoryId };

export type CategoryLabel = keyof typeof labelToCategoryId;
