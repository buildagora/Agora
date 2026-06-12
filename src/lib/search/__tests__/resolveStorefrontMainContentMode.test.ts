import { resolveStorefrontMainContentMode } from "../storefront/resolveStorefrontMainContentMode";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nresolveStorefrontMainContentMode tests\n");

assert(
  resolveStorefrontMainContentMode({
    tier: "READY",
    productCount: 24,
    capabilityProfileCount: 0,
  }) === "LIVE_PRODUCTS",
  "READY with products → LIVE_PRODUCTS"
);

assert(
  resolveStorefrontMainContentMode({
    tier: "READY",
    productCount: 0,
    capabilityProfileCount: 0,
  }) === "CAPABILITY_BROWSE",
  "READY without products → CAPABILITY_BROWSE"
);

assert(
  resolveStorefrontMainContentMode({
    tier: "PARTIAL",
    productCount: 3,
    capabilityProfileCount: 5,
  }) === "HYBRID",
  "PARTIAL with products → HYBRID"
);

assert(
  resolveStorefrontMainContentMode({
    tier: "CAPABILITY",
    productCount: 0,
    capabilityProfileCount: 0,
  }) === "CAPABILITY_BROWSE",
  "CAPABILITY → CAPABILITY_BROWSE"
);

console.log("\nAll resolveStorefrontMainContentMode tests passed.\n");
