/** Phase 4A + 9.5 Wave 1 HTML activation cohort. */
export const HTML_SCRAPE_ALLOWLIST = new Set<string>([
  "re_michel_hsv",
  "wittichen_hsv",
  "84_lumber_mad",
  "acme_brick_madison",
  "american_pipe_hsv",
  "carpet_one_hsv",
  "daltile_hsv",
  "eastern_industrial_hsv",
  "esc_supply_hsv",
  "lansing_hsv",
  "winsupply_hsv",
]);

/** Phase 9.5 Wave 1 — suppliers added from Category A allowlist gap audit. */
export const HTML_SCRAPE_WAVE1_SUPPLIERS = [
  "84_lumber_mad",
  "acme_brick_madison",
  "american_pipe_hsv",
  "carpet_one_hsv",
  "daltile_hsv",
  "eastern_industrial_hsv",
  "esc_supply_hsv",
  "lansing_hsv",
  "winsupply_hsv",
] as const;

export function getHtmlScrapeUnsupportedReason(supplierId: string): string | null {
  if (!HTML_SCRAPE_ALLOWLIST.has(supplierId)) {
    return "supplier_not_allowlisted";
  }
  return null;
}

export function isHtmlScrapeExecutionAllowed(supplierId: string): boolean {
  return getHtmlScrapeUnsupportedReason(supplierId) === null;
}
