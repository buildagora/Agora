import type { SupplierProductResult } from "../../types";
import {
  CAPABILITY_PROFILE_RANKING_SIGNALS,
  isCapabilityProfileResult,
} from "../profileResultContract";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function profileRow(
  overrides: Partial<SupplierProductResult> = {}
): SupplierProductResult {
  return {
    supplierId: "abc_supply_hsv",
    title: "Likely carries: Atlas — Asphalt Shingles",
    brand: "Atlas",
    imageUrl: null,
    price: null,
    productUrl: "https://www.abcsupply.com/products/",
    source: "ABC_SUPPLY",
    availability: "Likely carries",
    classification: "BRAND_PAGE",
    score: 58,
    rankingSignals: [...CAPABILITY_PROFILE_RANKING_SIGNALS],
    ...overrides,
  };
}

function liveRow(
  overrides: Partial<SupplierProductResult> = {}
): SupplierProductResult {
  return {
    supplierId: "grainger_hsv",
    title: "#8 Screw",
    brand: null,
    imageUrl: "https://example.com/screw.jpg",
    price: "$12.99",
    productUrl: "https://www.grainger.com/product/123",
    source: "GRAINGER",
    availability: "Found on supplier site",
    classification: "PRODUCT_PAGE",
    ...overrides,
  };
}

console.log("\nprofileResultContract tests\n");

assert(isCapabilityProfileResult(profileRow()), "profile row passes guard");
assert(
  !isCapabilityProfileResult(liveRow()),
  "live product row fails guard"
);
assert(
  !isCapabilityProfileResult(
    profileRow({ rankingSignals: ["capability_profile"] })
  ),
  "partial signals fail guard"
);
assert(
  !isCapabilityProfileResult(profileRow({ price: "$1.00" })),
  "profile row with price fails guard"
);
assert(
  !isCapabilityProfileResult(profileRow({ classification: "PRODUCT_PAGE" })),
  "PRODUCT_PAGE fails guard"
);
assert(
  !isCapabilityProfileResult(profileRow({ imageUrl: "https://x.com/i.jpg" })),
  "profile row with image fails guard"
);

console.log("\nAll profileResultContract tests passed.\n");
