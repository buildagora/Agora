import { normalizeStorefrontLabel } from "./normalizeStorefrontLabel";

/**
 * Brand logo registry — maps normalized labels to wordmark SVG slugs under /storefront/brands/.
 * Only map true aliases or parent-company relationships. Wrong logo is worse than no logo.
 */
const BRAND_LOGO_ALIASES: Record<string, string> = {
  // Roofing
  gaf: "gaf",
  certainteed: "certainteed",
  "certain teed": "certainteed",
  "owens corning": "owens-corning",
  "owens-corning": "owens-corning",
  tamko: "tamko",
  "tamko building products": "tamko",
  iko: "iko",
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

export function lookupBrandLogo(
  label: string
): { src: string; slug: string } | null {
  const key = normalizeStorefrontLabel(label);
  const slug = BRAND_LOGO_ALIASES[key];
  if (!slug) return null;
  return { src: `/storefront/brands/${slug}.svg`, slug };
}

export function listRegisteredBrandSlugs(): string[] {
  return [...new Set(Object.values(BRAND_LOGO_ALIASES))].sort();
}
