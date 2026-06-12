import type { SupplierFingerprintFacts } from "../fingerprint/types";
import { normalizeStoredSitemapUrls } from "../schema/sitemapParse";

/** Phase 3B/4B + 8F.2 schema activation cohort. */
export const SCHEMA_OR_SITEMAP_ALLOWLIST = new Set<string>([
  "abc_supply_hsv",
  "gulfeagle_hsv",
  "trane_supply_hsv",
  "wittichen_hsv",
  "grainger_hsv",
  "ferguson_plumbing_hsv",
  "srs_hsv",
  "shearer_supply_hsv",
  "bfs_hsv",
  "city_electric_hsv",
]);

export function getSchemaOrSitemapUnsupportedReason(
  supplierId: string,
  facts: SupplierFingerprintFacts
): string | null {
  if (!SCHEMA_OR_SITEMAP_ALLOWLIST.has(supplierId)) {
    return "supplier_not_allowlisted";
  }
  if (facts.hasSchemaMarkup !== true && facts.hasSitemap !== true) {
    return "no_schema_or_sitemap_facts";
  }
  if (
    facts.hasSitemap === true &&
    normalizeStoredSitemapUrls(facts.sitemapUrls).length === 0
  ) {
    return "fingerprint_incomplete";
  }
  return null;
}

export function isSchemaOrSitemapExecutionAllowed(
  supplierId: string,
  facts: SupplierFingerprintFacts
): boolean {
  return getSchemaOrSitemapUnsupportedReason(supplierId, facts) === null;
}
