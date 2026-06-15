import { normalizeStorefrontLabel } from "./normalizeStorefrontLabel";

/**
 * Brand logo registry — maps normalized labels to wordmark SVG slugs under /storefront/brands/.
 * Only map true aliases or parent-company relationships. Wrong logo is worse than no logo.
 */
const BRAND_LOGO_ALIASES: Record<string, string> = {
  // Roofing
  atlas: "atlas",
  "atlas roofing": "atlas",
  gaf: "gaf",
  certainteed: "certainteed",
  "certain teed": "certainteed",
  "owens corning": "owens-corning",
  "owens-corning": "owens-corning",
  tamko: "tamko",
  "tamko building products": "tamko",
  iko: "iko",
  // Siding / building products
  "james hardie": "james-hardie",
  hardie: "james-hardie",
  "lp smartside": "lp-smartside",
  "lp smart side": "lp-smartside",
  usg: "usg",
  "usg corporation": "usg",
  sheetrock: "usg",
  // Paint
  "sherwin-williams": "sherwin-williams",
  "sherwin williams": "sherwin-williams",
  ppg: "ppg",
  "ppg paints": "ppg",
  "benjamin moore": "benjamin-moore",
  "farrell-calhoun": "farrell-calhoun",
  "farrell calhoun": "farrell-calhoun",
  // Flooring / tile
  daltile: "daltile",
  mohawk: "mohawk",
  schluter: "schluter",
  // HVAC
  lennox: "lennox",
  trane: "trane",
  carrier: "carrier",
  // Plumbing
  kohler: "kohler",
  moen: "moen",
  delta: "delta",
  "delta faucet": "delta",
  "american standard": "american-standard",
  // Tools / fasteners
  milwaukee: "milwaukee",
  dewalt: "dewalt",
  "de walt": "dewalt",
  "stanley black decker": "dewalt",
  "stanley black & decker": "dewalt",
  hilti: "hilti",
  paslode: "paslode",
  "simpson strong-tie": "simpson-strong-tie",
  "simpson strong tie": "simpson-strong-tie",
  "grip-rite": "grip-rite",
  "grip rite": "grip-rite",
  // Fencing / decking
  trex: "trex",
  barrette: "barrette",
  "barrette outdoor living": "barrette",
  "red brand": "red-brand",
  yardlink: "yardlink",
};

/** Real raster logo assets under /storefront/brands/ (homepage + storefront). */
const BRAND_LOGO_FILES: Record<string, string> = {
  usg: "usg.png",
  "james-hardie": "james-hardie.png",
  "lp-smartside": "lp-smartside.jpg",
  daltile: "daltile.jpg",
  mohawk: "mohawk.png",
  gaf: "gaf.png",
  milwaukee: "milwaukee.png",
  "simpson-strong-tie": "simpson-strong-tie.jpg",
  trex: "trex.jpg",
  "owens-corning": "owens-corning.png",
};

export function brandLogoAssetSrc(slug: string): string {
  const file = BRAND_LOGO_FILES[slug] ?? `${slug}.svg`;
  return `/storefront/brands/${file}`;
}

export function hasRealBrandLogo(slug: string): boolean {
  return slug in BRAND_LOGO_FILES;
}

export function lookupBrandLogo(
  label: string
): { src: string; slug: string } | null {
  const key = normalizeStorefrontLabel(label);
  const slug = BRAND_LOGO_ALIASES[key];
  if (!slug) return null;
  return { src: brandLogoAssetSrc(slug), slug };
}

export function listRegisteredBrandSlugs(): string[] {
  return [...new Set(Object.values(BRAND_LOGO_ALIASES))].sort();
}
