/**
 * Storefront site-search routing (PR 1 — unified registry config).
 * Run: npm run test:fetch-storefront-site-search
 */

import { resolveStorefrontSiteSearchStrategy } from "../storefront/resolveStorefrontSiteSearchStrategy";
import {
  SUPPLIER_SITE_SEARCH_CONFIG,
  getSupplierSiteSearchConfig,
} from "@/lib/suppliers/supplierSiteSearchConfig";
import { SUPPLIER_DOMAIN_PLATFORM_CONFIG } from "@/lib/suppliers/supplierDomainPlatformConfig";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nfetchSupplierSiteSearchForStorefront routing tests\n");

assert(
  SUPPLIER_SITE_SEARCH_CONFIG.cmn90dbjr000404ldzhcsquav.domain === "qxo.com",
  "QXO canonical domain is qxo.com in shared config"
);
assert(
  SUPPLIER_SITE_SEARCH_CONFIG.cmn90dbjr000404ldzhcsquav.domain !== "beaconbuildingproducts.com",
  "QXO config does not use beaconbuildingproducts.com"
);

const abcConfig = getSupplierSiteSearchConfig("abc_supply_hsv");
assert(abcConfig?.mode === "site_organic", "ABC adapter mode is site_organic");
assert(abcConfig?.domain === "abcsupply.com", "ABC config domain is abcsupply.com");
assert(abcConfig?.extractImagesFromPage === true, "ABC extractImagesFromPage enabled");

const qxoStrategy = resolveStorefrontSiteSearchStrategy(
  "cmn90dbjr000404ldzhcsquav",
  null,
  "QXO"
);
assert(qxoStrategy.kind === "constructor", "QXO storefront uses constructor with null DB domain");
if (qxoStrategy.kind === "constructor") {
  assert(qxoStrategy.domain === "qxo.com", "QXO storefront strategy domain is qxo.com");
  assert(qxoStrategy.source === "QXO", "QXO storefront strategy source is QXO");
  assert(
    qxoStrategy.constructorConfig.apiKeyEnv === "CONSTRUCTOR_API_KEY_QXO",
    "QXO constructor config references CONSTRUCTOR_API_KEY_QXO"
  );
}

const abcStrategy = resolveStorefrontSiteSearchStrategy(
  "abc_supply_hsv",
  null,
  "ABC Supply"
);
assert(abcStrategy.kind === "site_organic", "ABC storefront uses site_organic when DB domain null");
if (abcStrategy.kind === "site_organic") {
  assert(abcStrategy.domain === "abcsupply.com", "ABC strategy domain is abcsupply.com");
}

const graingerStrategy = resolveStorefrontSiteSearchStrategy(
  "grainger_hsv",
  "wrong.example.com",
  "Grainger"
);
assert(graingerStrategy.kind === "site_organic", "Grainger uses registry config over DB domain");
if (graingerStrategy.kind === "site_organic") {
  assert(graingerStrategy.domain === "grainger.com", "Grainger strategy domain is grainger.com");
}

const fergusonStrategy = resolveStorefrontSiteSearchStrategy(
  "ferguson_plumbing_hsv",
  "ferguson.com",
  "Ferguson"
);
assert(fergusonStrategy.kind === "site_organic", "Ferguson uses site_organic config");
if (fergusonStrategy.kind === "site_organic") {
  assert(fergusonStrategy.domain === "ferguson.com", "Ferguson strategy domain is ferguson.com");
}

const hdStrategy = resolveStorefrontSiteSearchStrategy(
  "home_depot_north_hsv",
  null,
  "Home Depot"
);
assert(hdStrategy.kind === "product_engine", "Home Depot uses product_engine path");

const lowesStrategy = resolveStorefrontSiteSearchStrategy(
  "lowes_hsv",
  null,
  "Lowe's"
);
assert(lowesStrategy.kind === "product_engine", "Lowe's uses product_engine path");

const genericStrategy = resolveStorefrontSiteSearchStrategy(
  "city_electric_hsv",
  "cityelectricsupply.com",
  "City Electric"
);
assert(genericStrategy.kind === "generic_db", "Unregistered supplier uses DB domain");
if (genericStrategy.kind === "generic_db") {
  assert(genericStrategy.domain === "cityelectricsupply.com", "Generic strategy uses trimmed DB domain");
}

const noDomainStrategy = resolveStorefrontSiteSearchStrategy(
  "city_electric_hsv",
  null,
  "City Electric"
);
assert(noDomainStrategy.kind === "empty", "Unregistered supplier with no DB domain is empty");

const bakerStrategy = resolveStorefrontSiteSearchStrategy("baker_hsv", null, "Baker");
assert(bakerStrategy.kind === "platform_catalog", "Baker uses platform_catalog (Bloomreach)");
if (bakerStrategy.kind === "platform_catalog") {
  assert(bakerStrategy.config.mode === "bloomreach", "Baker platform mode is bloomreach");
}

const johnstoneStrategy = resolveStorefrontSiteSearchStrategy(
  "johnstone_hsv",
  null,
  "Johnstone"
);
assert(johnstoneStrategy.kind === "platform_catalog", "Johnstone uses platform_catalog (SLI)");

const siteoneStrategy = resolveStorefrontSiteSearchStrategy(
  "siteone_hsv",
  "siteone.com",
  "SiteOne"
);
assert(siteoneStrategy.kind === "platform_catalog", "SiteOne uses domain Hybris config");
if (siteoneStrategy.kind === "platform_catalog") {
  assert(
    SUPPLIER_DOMAIN_PLATFORM_CONFIG["siteone.com"].mode === "hybris",
    "SiteOne domain config is hybris"
  );
}

const llStrategy = resolveStorefrontSiteSearchStrategy(
  "ll_flooring_hsv",
  "lumberliquidators.com",
  "LL Flooring"
);
assert(llStrategy.kind === "platform_catalog", "LL Flooring uses domain Shopify config");
if (llStrategy.kind === "platform_catalog") {
  assert(
    SUPPLIER_DOMAIN_PLATFORM_CONFIG["lumberliquidators.com"].mode === "shopify",
    "LL Flooring domain config is shopify"
  );
}

const lennoxStrategy = resolveStorefrontSiteSearchStrategy(
  "lennox_hsv",
  null,
  "Lennox"
);
assert(lennoxStrategy.kind === "platform_catalog", "Lennox uses registry Hybris config");
if (lennoxStrategy.kind === "platform_catalog") {
  assert(lennoxStrategy.config.mode === "hybris", "Lennox platform mode is hybris");
}

const floorDecorStrategy = resolveStorefrontSiteSearchStrategy(
  "floor_and_decor_hsv",
  "flooranddecor.com",
  "Floor & Decor"
);
assert(floorDecorStrategy.kind === "platform_catalog", "Floor & Decor uses domain Algolia config");

console.log("\nAll fetchSupplierSiteSearchForStorefront routing tests passed.\n");
