/**
 * Supplier storefront view model tests (PR 1).
 * Run: npm run test:storefront
 */

import { assembleSupplierStorefrontView } from "../storefront/buildSupplierStorefrontView";
import { EMPTY_STOREFRONT_BUILD_DATA } from "../storefront/storefrontBuildData";
import { getStorefrontLayoutMode } from "../storefront/getStorefrontLayoutMode";
import { isSupplierStorefrontEnabled } from "../storefront/isSupplierStorefrontEnabled";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => void
): void {
  const prev = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
}

console.log("\nsupplierStorefront tests\n");

assert(
  getStorefrontLayoutMode("BROAD") === "EXPLORATION",
  "BROAD maps to EXPLORATION"
);
assert(
  getStorefrontLayoutMode("REFINED") === "EXPLORATION",
  "REFINED maps to EXPLORATION"
);
assert(
  getStorefrontLayoutMode("EXACT") === "PRODUCT_FIRST",
  "EXACT maps to PRODUCT_FIRST"
);
assert(
  getStorefrontLayoutMode("BROAD", { listingTitle: "Some SKU" }) ===
    "PRODUCT_FIRST",
  "listingTitle forces PRODUCT_FIRST"
);

withEnv("SUPPLIER_STOREFRONT_ENABLED", undefined, () => {
  assert(!isSupplierStorefrontEnabled(), "flag off when unset");
});
withEnv("SUPPLIER_STOREFRONT_ENABLED", "", () => {
  assert(!isSupplierStorefrontEnabled(), "flag off when empty");
});
withEnv("SUPPLIER_STOREFRONT_ENABLED", "0", () => {
  assert(!isSupplierStorefrontEnabled(), "flag off for 0");
});
withEnv("SUPPLIER_STOREFRONT_ENABLED", "false", () => {
  assert(!isSupplierStorefrontEnabled(), "flag off for false");
});
withEnv("SUPPLIER_STOREFRONT_ENABLED", "1", () => {
  assert(isSupplierStorefrontEnabled(), "flag on for 1");
});
withEnv("SUPPLIER_STOREFRONT_ENABLED", "true", () => {
  assert(isSupplierStorefrontEnabled(), "flag on for true");
});

const baseInput = {
  query: "paint",
  productSearchQuery: "paint",
  categoryId: "paint",
  categoryLabel: "Paint",
  supplier: {
    id: "home_depot_hsv",
    name: "The Home Depot",
    logoUrl: null,
    city: "Huntsville",
    state: "AL",
    websiteUrl: "https://www.homedepot.com",
  },
  searchMode: "BROAD" as const,
};

const view = assembleSupplierStorefrontView(baseInput, EMPTY_STOREFRONT_BUILD_DATA);

assert(view.layoutMode === "EXPLORATION", "skeleton BROAD layout");
assert(view.searchMode === "BROAD", "skeleton preserves searchMode");
assert(view.provenance === "NONE", "skeleton provenance NONE");
assert(view.sections.brands.length === 0, "skeleton empty brands");
assert(view.sections.categories.length === 0, "skeleton empty categories");
assert(view.sections.products.length === 0, "skeleton empty products");
assert(view.sections.capabilityProfiles.length === 0, "skeleton empty capability profiles");
assert(view.sections.facetGroups.length === 0, "skeleton empty facets");
assert(
  view.header.title === "paint",
  "skeleton header title from query"
);
assert(
  view.header.subtitle === "Results from The Home Depot",
  "skeleton header subtitle"
);
assert(
  !("totalProducts" in view) && !("productCount" in view.header),
  "view omits fake catalog counts"
);

withEnv("SUPPLIER_STOREFRONT_ENABLED", undefined, () => {
  assert(
    !assembleSupplierStorefrontView(baseInput, EMPTY_STOREFRONT_BUILD_DATA)
      .featureEnabled,
    "skeleton featureEnabled false by default"
  );
});

const exactView = assembleSupplierStorefrontView(
  { ...baseInput, searchMode: "EXACT" },
  EMPTY_STOREFRONT_BUILD_DATA
);
assert(exactView.layoutMode === "PRODUCT_FIRST", "skeleton EXACT layout");

const refinedView = assembleSupplierStorefrontView(
  {
    ...baseInput,
    query: "steep slope roofing",
    searchMode: "REFINED",
  },
  EMPTY_STOREFRONT_BUILD_DATA
);
assert(
  refinedView.layoutMode === "EXPLORATION",
  "skeleton REFINED uses exploration layout"
);

console.log("\nAll supplierStorefront tests passed.\n");
