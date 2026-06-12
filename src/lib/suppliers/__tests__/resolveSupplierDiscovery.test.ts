import { SUPPLIER_SITE_SEARCH_CONFIG } from "../supplierSiteSearchConfig";
import { SUPPLIER_DOMAIN_PLATFORM_CONFIG } from "../supplierDomainPlatformConfig";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nresolveSupplierDiscovery config tests\n");

assert(
  SUPPLIER_SITE_SEARCH_CONFIG.cmn90dbjr000404ldzhcsquav.mode === "constructor",
  "QXO mode is constructor"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.baker.mode === "bloomreach",
  "Baker mode is bloomreach"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.johnstone.mode === "sli",
  "Johnstone mode is sli"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.mingledorffs.mode === "coveo",
  "Mingledorffs mode is coveo"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.ecmd.mode === "bloomreach",
  "ECMD mode is bloomreach"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.ecmd.domain === "ecmdi.com",
  "ECMD domain is ecmdi.com"
);
assert(
  SUPPLIER_DOMAIN_PLATFORM_CONFIG["siteone.com"].mode === "hybris",
  "SiteOne domain config is hybris"
);
assert(
  SUPPLIER_DOMAIN_PLATFORM_CONFIG["lumberliquidators.com"].mode === "shopify",
  "LL Flooring domain config is shopify"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.lennox.mode === "hybris",
  "Lennox mode is hybris"
);
assert(
  SUPPLIER_DOMAIN_PLATFORM_CONFIG["flooranddecor.com"].mode === "algolia",
  "Floor & Decor domain config is algolia"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.abc_supply.mode === "site_organic",
  "ABC remains site_organic"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.home_depot.mode === "product_engine",
  "Home Depot remains product_engine"
);

console.log("\nAll resolveSupplierDiscovery config tests passed.\n");
