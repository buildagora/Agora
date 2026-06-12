import { buildFactsFromLegacy } from "../buildFactsFromLegacy";
import type { SupplierFingerprintFacts } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function assertNoChosenStrategy(facts: SupplierFingerprintFacts) {
  assert(
    !("chosenStrategy" in facts),
    `facts for ${facts.supplierId} must not include chosenStrategy`
  );
}

console.log("\nbuildFactsFromLegacy tests\n");

const fixedDate = new Date("2026-06-04T12:00:00.000Z");

const homeDepot = buildFactsFromLegacy({
  supplier: { id: "home_depot_hsv", domain: "homedepot.com" },
  asOf: fixedDate,
});
assert(homeDepot.detectedPlatform === "UNKNOWN", "Home Depot → UNKNOWN platform");
assert(homeDepot.allowSerpFallback === true, "Home Depot → allowSerpFallback true");
assert(homeDepot.legacySnapshot.matchKind === "product_engine", "Home Depot snapshot product_engine");
assertNoChosenStrategy(homeDepot);

const lowes = buildFactsFromLegacy({
  supplier: { id: "lowes_aus", domain: "lowes.com" },
  asOf: fixedDate,
});
assert(lowes.allowSerpFallback === true, "Lowe's → allowSerpFallback true");
assert(lowes.legacySnapshot.mode === "product_engine", "Lowe's legacy mode product_engine");
assertNoChosenStrategy(lowes);

const johnstone = buildFactsFromLegacy({
  supplier: { id: "johnstone_nyc", domain: "johnstonesupply.com" },
  asOf: fixedDate,
});
assert(johnstone.detectedPlatform === "SLI", "Johnstone → SLI");
assert(johnstone.platformAccessStatus === "ACCESSIBLE", "Johnstone → ACCESSIBLE");
assert(johnstone.allowSerpFallback === false, "Johnstone → allowSerpFallback false");
assertNoChosenStrategy(johnstone);

const baker = buildFactsFromLegacy({
  supplier: { id: "baker_atl", domain: "bakerdist.com" },
  envKeyPresence: {},
  asOf: fixedDate,
});
assert(baker.detectedPlatform === "BLOOMREACH", "Baker → BLOOMREACH");
assert(
  baker.platformAccessStatus === "BINDING_INCOMPLETE",
  "Baker without bloomreach env → BINDING_INCOMPLETE"
);
assertNoChosenStrategy(baker);

const floorDecor = buildFactsFromLegacy({
  supplier: { id: "floor_decor_dal", domain: "flooranddecor.com" },
  asOf: fixedDate,
});
assert(floorDecor.detectedPlatform === "ALGOLIA", "Floor & Decor → ALGOLIA");
assert(
  floorDecor.platformAccessStatus === "PUBLIC_ANONYMOUS",
  "Floor & Decor → PUBLIC_ANONYMOUS"
);
assert(floorDecor.hasPublicApi === true, "Floor & Decor → hasPublicApi true");
assert(
  floorDecor.publicApiAccessStatus === "ACCESSIBLE",
  "Floor & Decor → publicApiAccessStatus ACCESSIBLE"
);
assert(
  floorDecor.publicApiEndpoint?.includes("algolia.net") === true,
  "Floor & Decor → publicApiEndpoint populated"
);
assertNoChosenStrategy(floorDecor);

const ppg = buildFactsFromLegacy({
  supplier: { id: "ppg_paint_hsv", domain: "ppgpaints.com" },
  envKeyPresence: {},
  asOf: fixedDate,
});
assert(
  ppg.platformAccessStatus === "PUBLIC_ANONYMOUS",
  "PPG storefront Algolia → PUBLIC_ANONYMOUS"
);
assert(ppg.hasPublicApi === true, "PPG storefront Algolia → hasPublicApi true");
assert(
  ppg.publicApiAccessStatus === "ACCESSIBLE",
  "PPG storefront Algolia → publicApiAccessStatus ACCESSIBLE"
);

const generic = buildFactsFromLegacy({
  supplier: { id: "city_electric_hsv", domain: "cityelectricsupply.com" },
  asOf: fixedDate,
});
assert(generic.allowSerpFallback === true, "Generic domain supplier → allowSerpFallback true");
assert(generic.legacySnapshot.matchKind === "generic_domain", "Generic → generic_domain snapshot");
assertNoChosenStrategy(generic);

const noDomain = buildFactsFromLegacy({
  supplier: { id: "cap_only_supplier", domain: null },
  audit: { capabilityOnly: true },
  asOf: fixedDate,
});
assert(noDomain.allowSerpFallback === false, "No domain / capability → allowSerpFallback false");
assert(
  noDomain.legacySnapshot.matchKind === "capability_only",
  "Capability-only snapshot kind"
);
assertNoChosenStrategy(noDomain);

const ferguson = buildFactsFromLegacy({
  supplier: { id: "ferguson_wdc", domain: "ferguson.com" },
  asOf: fixedDate,
});
assert(ferguson.allowSerpFallback === true, "site_organic Ferguson → allowSerpFallback true");
assert(ferguson.legacySnapshot.matchKind === "site_organic", "Ferguson snapshot site_organic");
assert(ferguson.platformAccessStatus === "NOT_APPLICABLE", "site_organic → NOT_APPLICABLE access");
assertNoChosenStrategy(ferguson);

assert(
  homeDepot.fingerprintStatus === "SUCCESS" && homeDepot.lastFingerprintedAt?.getTime() === fixedDate.getTime(),
  "facts include SUCCESS status and asOf timestamp"
);

console.log("\nAll buildFactsFromLegacy tests passed.\n");
