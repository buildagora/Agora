import {
  getSchemaOrSitemapUnsupportedReason,
  isSchemaOrSitemapExecutionAllowed,
  SCHEMA_OR_SITEMAP_ALLOWLIST,
} from "../resolveSchemaOrSitemapExecution";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function baseFacts(
  overrides: Partial<SupplierFingerprintFacts> = {}
): SupplierFingerprintFacts {
  return {
    supplierId: "abc_supply_hsv",
    canonicalDomain: "abcsupply.com",
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: 1,
    platformDetectionSource: "legacy_config",
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingId: null,
    platformBindingValid: false,
    hasPublicApi: null,
    publicApiAccessStatus: "NOT_PROBED",
    publicApiEndpoint: null,
    hasSchemaMarkup: false,
    hasSitemap: true,
    sitemapUrls: ["https://www.example.com/sitemap.xml"],
    renderingType: "UNKNOWN",
    isSPA: null,
    antiBotRisk: "HIGH",
    demandPriority: "MEDIUM",
    demandScore: null,
    allowSerpFallback: true,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: { matchKind: "site_organic", mode: "site_organic" },
    notes: null,
    ...overrides,
  };
}

console.log("\nresolveSchemaOrSitemapExecution tests\n");

assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("abc_supply_hsv"), "allowlist includes abc_supply_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("gulfeagle_hsv"), "allowlist includes gulfeagle_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("trane_supply_hsv"), "allowlist includes trane_supply_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("wittichen_hsv"), "allowlist includes wittichen_hsv");
assert(!SCHEMA_OR_SITEMAP_ALLOWLIST.has("lansing_hsv"), "allowlist excludes lansing_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("grainger_hsv"), "allowlist includes grainger_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("ferguson_plumbing_hsv"), "allowlist includes ferguson_plumbing_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("srs_hsv"), "allowlist includes srs_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("shearer_supply_hsv"), "allowlist includes shearer_supply_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("bfs_hsv"), "allowlist includes bfs_hsv");
assert(SCHEMA_OR_SITEMAP_ALLOWLIST.has("city_electric_hsv"), "allowlist includes city_electric_hsv");

assert(
  isSchemaOrSitemapExecutionAllowed(
    "abc_supply_hsv",
    baseFacts({ supplierId: "abc_supply_hsv" })
  ),
  "ABC with sitemap facts is allowed"
);

assert(
  isSchemaOrSitemapExecutionAllowed(
    "gulfeagle_hsv",
    baseFacts({
      supplierId: "gulfeagle_hsv",
      canonicalDomain: "gulfeaglesupply.com",
      sitemapUrls: ["https://www.gulfeaglesupply.com/sitemap_index.xml"],
    })
  ),
  "Gulf Eagle with sitemap facts is allowed"
);

assert(
  isSchemaOrSitemapExecutionAllowed(
    "trane_supply_hsv",
    baseFacts({
      supplierId: "trane_supply_hsv",
      canonicalDomain: "trane.com",
      sitemapUrls: [
        "http://www.trane.com/sitemap-index.xml",
        "https://www.trane.com/commercial/sitemap-index.xml",
      ],
    })
  ),
  "Trane with sitemap facts is allowed"
);

assert(
  isSchemaOrSitemapExecutionAllowed(
    "wittichen_hsv",
    baseFacts({
      supplierId: "wittichen_hsv",
      canonicalDomain: "wittichen-supply.com",
      sitemapUrls: [
        "https://www.wittichen-supply.com/sitemap.xml",
        "https://www.wittichen-supply.com/sitemap/child.xml.gz",
      ],
    })
  ),
  "Wittichen with sitemap facts is allowed"
);

assert(
  getSchemaOrSitemapUnsupportedReason(
    "ferguson_wdc",
    baseFacts({ supplierId: "ferguson_wdc" })
  ) === "supplier_not_allowlisted",
  "non-allowlisted supplier blocked"
);

assert(
  getSchemaOrSitemapUnsupportedReason(
    "gulfeagle_hsv",
    baseFacts({
      supplierId: "gulfeagle_hsv",
      hasSitemap: true,
      sitemapUrls: null,
    })
  ) === "fingerprint_incomplete",
  "Gulf Eagle incomplete fingerprint blocked"
);

console.log("\nAll resolveSchemaOrSitemapExecution tests passed.\n");
