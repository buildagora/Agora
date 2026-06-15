export type HomeSuggestedSearch = {
  id: string;
  label: string;
  query: string;
};

export type HomePopularCategory = {
  id: string;
  label: string;
  query: string;
  iconSlug: string;
};

export type HomeCategoryCatalogEntry = {
  id: string;
  label: string;
  query: string;
  iconSlug: string;
};

export type HomePopularBrand = {
  id: string;
  label: string;
  query: string;
  logoLabel: string;
};

export const HOME_SUGGESTED_SEARCHES: HomeSuggestedSearch[] = [
  { id: "usg-drywall", label: "USG drywall", query: "USG drywall" },
  {
    id: "james-hardie-siding",
    label: "James Hardie siding",
    query: "James Hardie siding",
  },
  { id: "gaf-shingles", label: "GAF shingles", query: "GAF shingles" },
  { id: "daltile-tile", label: "Daltile tile", query: "Daltile tile" },
];

export const HOME_POPULAR_CATEGORIES: HomePopularCategory[] = [
  {
    id: "roofing",
    label: "Roofing",
    query: "roofing materials",
    iconSlug: "roofing",
  },
  {
    id: "flooring",
    label: "Flooring",
    query: "flooring",
    iconSlug: "flooring",
  },
  {
    id: "drywall",
    label: "Drywall & Insulation",
    query: "drywall insulation",
    iconSlug: "drywall",
  },
  {
    id: "lumber",
    label: "Lumber & Framing",
    query: "lumber framing",
    iconSlug: "lumber",
  },
  {
    id: "siding",
    label: "Siding & Exterior",
    query: "siding exterior",
    iconSlug: "siding",
  },
  {
    id: "concrete",
    label: "Concrete & Masonry",
    query: "concrete masonry",
    iconSlug: "concrete",
  },
];

/** Full category picker — aligned with categoryVisualRegistry slugs. */
export const HOME_CATEGORY_CATALOG: HomeCategoryCatalogEntry[] = [
  { id: "roofing", label: "Roofing", query: "roofing materials", iconSlug: "roofing" },
  {
    id: "asphalt-shingles",
    label: "Asphalt Shingles",
    query: "asphalt shingles",
    iconSlug: "asphalt-shingles",
  },
  { id: "flooring", label: "Flooring", query: "flooring", iconSlug: "flooring" },
  { id: "tile", label: "Tile", query: "tile", iconSlug: "tile" },
  { id: "drywall", label: "Drywall", query: "drywall", iconSlug: "drywall" },
  {
    id: "insulation",
    label: "Insulation",
    query: "insulation",
    iconSlug: "insulation",
  },
  { id: "lumber", label: "Lumber", query: "lumber framing", iconSlug: "lumber" },
  { id: "siding", label: "Siding", query: "siding exterior", iconSlug: "siding" },
  {
    id: "concrete",
    label: "Concrete",
    query: "concrete masonry",
    iconSlug: "concrete",
  },
  {
    id: "plumbing",
    label: "Plumbing",
    query: "plumbing materials",
    iconSlug: "plumbing",
  },
  { id: "pipe", label: "Pipe", query: "pipe", iconSlug: "pipe" },
  { id: "paint", label: "Paint", query: "paint", iconSlug: "paint" },
  { id: "hvac", label: "HVAC", query: "hvac equipment", iconSlug: "hvac" },
  {
    id: "electrical",
    label: "Electrical",
    query: "electrical supplies",
    iconSlug: "electrical",
  },
  { id: "windows", label: "Windows", query: "windows", iconSlug: "windows" },
  { id: "doors", label: "Doors", query: "doors", iconSlug: "doors" },
  {
    id: "fasteners",
    label: "Fasteners",
    query: "fasteners",
    iconSlug: "fasteners",
  },
  { id: "screws", label: "Screws", query: "screws", iconSlug: "screws" },
  { id: "bolts", label: "Bolts", query: "bolts", iconSlug: "bolts" },
  { id: "steel", label: "Steel", query: "steel", iconSlug: "steel" },
  { id: "fencing", label: "Fencing", query: "fencing", iconSlug: "fencing" },
  {
    id: "landscaping",
    label: "Landscaping",
    query: "landscaping materials",
    iconSlug: "landscaping",
  },
];

/** Audit-driven homepage brand row (Huntsville market, Jun 2026). */
export const HOME_POPULAR_BRANDS: HomePopularBrand[] = [
  { id: "usg", label: "USG", query: "USG drywall", logoLabel: "USG" },
  {
    id: "james-hardie",
    label: "James Hardie",
    query: "James Hardie siding",
    logoLabel: "James Hardie",
  },
  {
    id: "lp-smartside",
    label: "LP SmartSide",
    query: "LP SmartSide siding",
    logoLabel: "LP SmartSide",
  },
  { id: "daltile", label: "Daltile", query: "Daltile tile", logoLabel: "Daltile" },
  { id: "mohawk", label: "Mohawk", query: "Mohawk flooring", logoLabel: "Mohawk" },
  { id: "gaf", label: "GAF", query: "GAF shingles", logoLabel: "GAF" },
  {
    id: "milwaukee",
    label: "Milwaukee",
    query: "Milwaukee tools",
    logoLabel: "Milwaukee",
  },
  {
    id: "simpson",
    label: "Simpson Strong-Tie",
    query: "Simpson Strong-Tie connectors",
    logoLabel: "Simpson Strong-Tie",
  },
  { id: "trex", label: "Trex", query: "Trex decking", logoLabel: "Trex" },
  {
    id: "owens-corning",
    label: "Owens Corning",
    query: "Owens Corning shingles",
    logoLabel: "Owens Corning",
  },
];

export function categoryIconSrc(slug: string): string {
  return `/storefront/categories/${slug}.svg`;
}
