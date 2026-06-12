import {
  resolveSupplierProbeQuery,
  SUPPLIER_PROBE_QUERY_OVERRIDES,
} from "../resolveSupplierProbeQuery";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nresolveSupplierProbeQuery tests\n");

assert(
  resolveSupplierProbeQuery({
    supplierId: "absolute_glass",
    primaryStrategy: "SERP_SITE_ORGANIC",
  }) === "glass",
  "glass supplier uses token heuristic not supplies"
);

assert(
  resolveSupplierProbeQuery({
    supplierId: "capitol_materials_athens",
    primaryStrategy: "SERP_SITE_ORGANIC",
  }) === "roofing shingles",
  "roofing token heuristic"
);

assert(
  resolveSupplierProbeQuery({
    supplierId: "unknown_supplier_xyz",
    primaryStrategy: "SERP_SITE_ORGANIC",
  }) === "building materials",
  "unknown SERP supplier falls back to building materials not supplies"
);

assert(
  resolveSupplierProbeQuery({
    supplierId: "unknown_supplier_xyz",
    primaryStrategy: "SERP_SITE_ORGANIC",
    primaryCategoryId: "hvac",
  }) === "furnace",
  "primaryCategoryId takes precedence over strategy fallback"
);

assert(
  resolveSupplierProbeQuery({
    supplierId: "lansing_hsv",
    primaryStrategy: "HTML_SCRAPE",
  }) === SUPPLIER_PROBE_QUERY_OVERRIDES.lansing_hsv,
  "explicit override wins"
);

assert(
  resolveSupplierProbeQuery({
    supplierId: "generic_domain_supplier",
    primaryStrategy: "HTML_SCRAPE",
  }) === "lumber",
  "HTML_SCRAPE strategy fallback"
);

console.log("\nAll resolveSupplierProbeQuery tests passed.\n");
