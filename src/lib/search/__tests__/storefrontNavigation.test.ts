/**
 * Storefront internal navigation URL tests.
 * Run: npm run test:storefront-navigation
 */

import {
  buildListingDrillHref,
  buildNavItemRefinementHref,
  buildStorefrontHref,
  composeStorefrontQuery,
  parseStorefrontUrlParams,
  storefrontFilterLabel,
} from "../storefront/storefrontNavigation";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nstorefrontNavigation tests\n");

assert(
  composeStorefrontQuery({
    requestText: "steep slope roofing",
    brand: "GAF",
  }) === "GAF steep slope roofing",
  "compose: brand + request text"
);

assert(
  composeStorefrontQuery({
    requestText: "steep slope roofing",
    brand: "GAF",
    category: "Asphalt Shingles",
  }) === "GAF Asphalt Shingles steep slope roofing",
  "compose: brand + category + request text"
);

assert(
  composeStorefrontQuery({
    requestText: "",
    brand: "GAF",
    category: "Asphalt Shingles",
  }) === "GAF Asphalt Shingles",
  "compose: brand + category only"
);

assert(
  composeStorefrontQuery({
    requestText: "schedule 40 pvc",
    listingTitle: "2 in PVC Pipe",
  }) === "2 in PVC Pipe",
  "compose: listing title wins for product drill"
);

const parsed = parseStorefrontUrlParams({
  brand: " GAF ",
  category: "Asphalt Shingles",
  fromThread: "t1",
  fromSearch: "s1",
});
assert(parsed.brand === "GAF", "parse: trims brand");
assert(parsed.category === "Asphalt Shingles", "parse: category");

assert(
  storefrontFilterLabel({ brand: "GAF", category: "Asphalt Shingles" }) ===
    "GAF · Asphalt Shingles",
  "filter label joins brand and category"
);

const base = { fromThread: "t1", fromSearch: "s1" };
assert(
  buildStorefrontHref("req1", "abc_supply_hsv", { brand: "GAF", clearListing: true }, base) ===
    "/request/req1/supplier/abc_supply_hsv?brand=GAF&fromThread=t1&fromSearch=s1",
  "buildStorefrontHref: brand preserves back params"
);

assert(
  buildNavItemRefinementHref(
    "req1",
    "grainger_hsv",
    { label: "Bolts", kind: "category" },
    { brand: "GAF", fromThread: "t1" }
  ).includes("category=Bolts") &&
    buildNavItemRefinementHref(
      "req1",
      "grainger_hsv",
      { label: "Bolts", kind: "category" },
      { brand: "GAF", fromThread: "t1" }
    ).includes("brand=GAF"),
  "nav refinement: sets category, keeps brand"
);

assert(
  buildListingDrillHref(
    "req1",
    "home_depot_hsv",
    {
      title: "Behr Paint",
      imageUrl: "https://example.com/i.jpg",
      price: "$30",
      productUrl: "https://homedepot.com/p/123",
    },
    { brand: "Behr", category: "Paint", fromThread: "t1" }
  ).includes("listingTitle=Behr+Paint") &&
    !buildListingDrillHref(
      "req1",
      "home_depot_hsv",
      {
        title: "Behr Paint",
        productUrl: "https://homedepot.com/p/123",
      },
      { brand: "Behr" }
    ).includes("q="),
  "listing drill: preserves filters, stores listingUrl, no q param"
);

console.log("\nAll storefrontNavigation tests passed.\n");
