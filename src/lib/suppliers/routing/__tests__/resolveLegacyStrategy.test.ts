import { buildFactsFromLegacy } from "../../fingerprint/buildFactsFromLegacy";
import { resolveLegacyStrategy } from "../resolveLegacyStrategy";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nresolveLegacyStrategy tests\n");

assert(
  resolveLegacyStrategy({ supplierId: "home_depot_hsv", canonicalDomain: "homedepot.com" })
    .strategy === "SERP_PRODUCT_ENGINE",
  "Home Depot → SERP_PRODUCT_ENGINE"
);

assert(
  resolveLegacyStrategy({ supplierId: "lowes_aus", canonicalDomain: "lowes.com" }).strategy ===
    "SERP_PRODUCT_ENGINE",
  "Lowe's → SERP_PRODUCT_ENGINE"
);

assert(
  resolveLegacyStrategy({ supplierId: "ferguson_wdc", canonicalDomain: "ferguson.com" })
    .strategy === "SERP_SITE_ORGANIC",
  "Ferguson site_organic → SERP_SITE_ORGANIC"
);

assert(
  resolveLegacyStrategy({ supplierId: "abc_supply_atl", canonicalDomain: "abcsupply.com" })
    .strategy === "SERP_SITE_ORGANIC",
  "ABC site_organic → SERP_SITE_ORGANIC"
);

assert(
  resolveLegacyStrategy({ supplierId: "srs_dal", canonicalDomain: "srsdistribution.com" })
    .strategy === "SERP_SITE_ORGANIC",
  "SRS site_organic → SERP_SITE_ORGANIC"
);

assert(
  resolveLegacyStrategy({
    supplierId: "city_electric_hsv",
    canonicalDomain: "cityelectricsupply.com",
  }).strategy === "SERP_SITE_ORGANIC",
  "generic domain → SERP_SITE_ORGANIC"
);

assert(
  resolveLegacyStrategy({
    supplierId: "cap_only",
    canonicalDomain: null,
    legacySnapshot: { matchKind: "capability_only" },
  }).strategy === "PROBABILISTIC_CATEGORY_PROFILE",
  "capability only → PROBABILISTIC_CATEGORY_PROFILE"
);

assert(
  resolveLegacyStrategy({ supplierId: "johnstone_nyc", canonicalDomain: "johnstonesupply.com" })
    .strategy === "PLATFORM_API",
  "Johnstone SLI → PLATFORM_API"
);

assert(
  resolveLegacyStrategy({ supplierId: "baker_atl", canonicalDomain: "bakerdist.com" }).strategy ===
    "PLATFORM_API",
  "Baker bloomreach legacy label → PLATFORM_API"
);

assert(
  resolveLegacyStrategy({
    supplierId: "floor_decor",
    canonicalDomain: "flooranddecor.com",
  }).strategy === "PUBLIC_API",
  "Floor & Decor algolia public → PUBLIC_API"
);

const floorFacts = buildFactsFromLegacy({
  supplier: { id: "floor_decor", domain: "flooranddecor.com" },
});
assert(
  resolveLegacyStrategy({
    supplierId: floorFacts.supplierId,
    canonicalDomain: floorFacts.canonicalDomain,
    legacySnapshot: floorFacts.legacySnapshot,
  }).strategy === "PUBLIC_API",
  "legacy resolver honors snapshot for domain platform"
);

console.log("\nAll resolveLegacyStrategy tests passed.\n");
