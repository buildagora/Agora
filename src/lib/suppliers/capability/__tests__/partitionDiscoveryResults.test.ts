import type { SupplierProductResult } from "../../types";
import { CAPABILITY_PROFILE_RANKING_SIGNALS } from "../profileResultContract";
import { partitionDiscoveryResults } from "../partitionDiscoveryResults";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function profileRow(title: string): SupplierProductResult {
  return {
    supplierId: "abc_supply_hsv",
    title,
    brand: "Atlas",
    imageUrl: null,
    price: null,
    productUrl: "https://www.abcsupply.com/products/",
    source: "ABC_SUPPLY",
    classification: "BRAND_PAGE",
    rankingSignals: [...CAPABILITY_PROFILE_RANKING_SIGNALS],
  };
}

function liveRow(title: string): SupplierProductResult {
  return {
    supplierId: "grainger_hsv",
    title,
    productUrl: "https://www.grainger.com/p/1",
    source: "GRAINGER",
    classification: "PRODUCT_PAGE",
    price: "$9.99",
    imageUrl: "https://example.com/i.jpg",
  };
}

console.log("\npartitionDiscoveryResults tests\n");

const mixed = partitionDiscoveryResults([
  liveRow("Screw"),
  profileRow("Likely carries: Atlas"),
  profileRow("Likely carries: GAF"),
]);
assert(mixed.liveProducts.length === 1, "mixed: one live product");
assert(mixed.capabilityProfiles.length === 2, "mixed: two profile rows");
assert(mixed.liveProducts[0]?.title === "Screw", "live product preserved");
assert(
  mixed.capabilityProfiles.every((r) => r.title.startsWith("Likely carries:")),
  "profile rows preserved"
);

const allProfile = partitionDiscoveryResults([
  profileRow("Likely carries: A"),
  profileRow("Likely carries: B"),
]);
assert(allProfile.liveProducts.length === 0, "all profile: no live");
assert(allProfile.capabilityProfiles.length === 2, "all profile: two rows");

const allLive = partitionDiscoveryResults([liveRow("A"), liveRow("B")]);
assert(allLive.liveProducts.length === 2, "all live: two rows");
assert(allLive.capabilityProfiles.length === 0, "all live: no profiles");

console.log("\nAll partitionDiscoveryResults tests passed.\n");
