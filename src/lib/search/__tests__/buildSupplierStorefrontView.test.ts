/**
 * Storefront view assembly tests (PR 5).
 * Run: npm run test:build-storefront-view
 */

import { assembleSupplierStorefrontView } from "../storefront/buildSupplierStorefrontView";
import {
  isStorefrontProduct,
  resolveStorefrontProducts,
} from "../storefront/mapStorefrontBuildData";
import type { SupplierCapabilityRow } from "../storefront/capabilityAggregateTypes";
import { aggregateSupplierCapabilitiesFromRows } from "../storefront/aggregateSupplierCapabilitiesFromRows";
import { EMPTY_STOREFRONT_BUILD_DATA } from "../storefront/storefrontBuildData";
import type { SupplierSiteSearchStructured } from "@/lib/suppliers/searchSupplierSiteTypes";
import type { SupplierProductResult } from "@/lib/suppliers/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const baseSupplier = {
  id: "abc_supply_hsv",
  name: "ABC Supply Co.",
  logoUrl: null,
  city: "Huntsville",
  state: "AL",
  websiteUrl: "https://www.abcsupply.com",
};

function serpRow(
  partial: Partial<SupplierProductResult> & Pick<SupplierProductResult, "title">
): SupplierProductResult {
  return {
    supplierId: partial.supplierId ?? "grainger_hsv",
    brand: null,
    imageUrl: "https://example.com/i.jpg",
    price: null,
    productUrl: partial.productUrl ?? "https://example.com/p",
    source: "GRAINGER",
    availability: null,
    ...partial,
  };
}

console.log("\nbuildSupplierStorefrontView tests\n");

// --- ABC + Steep Slope Roofing ---
const abcCapabilityRows: SupplierCapabilityRow[] = [
  {
    categoryId: "roofing",
    subcategory: "Steep Slope Roofing",
    brand: "",
    sourceUrl: "https://www.abcsupply.com/products/",
  },
  {
    categoryId: "roofing",
    subcategory: "Asphalt Shingles",
    brand: "GAF",
    sourceUrl: "https://www.abcsupply.com/products/",
  },
  {
    categoryId: "roofing",
    subcategory: "Asphalt Shingles",
    brand: "CertainTeed",
    sourceUrl: "https://www.abcsupply.com/products/",
  },
];

const abcView = assembleSupplierStorefrontView(
  {
    query: "steep slope roofing",
    productSearchQuery: "steep slope roofing",
    categoryId: "roofing",
    categoryLabel: "Roofing",
    supplier: baseSupplier,
    searchMode: "REFINED",
  },
  {
    capabilityAggregate: aggregateSupplierCapabilitiesFromRows(
      "abc_supply_hsv",
      abcCapabilityRows,
      { categoryId: "roofing" }
    ),
    siteSearch: {
      products: [],
      categories: [
        serpRow({
          supplierId: "abc_supply_hsv",
          title: "Roofing Products",
          productUrl: "https://www.abcsupply.com/category/roofing",
          classification: "CATEGORY_PAGE",
          source: "ABC_SUPPLY",
        }),
      ],
      brands: [],
      other: [],
      flat: [],
    },
  }
);

assert(abcView.layoutMode === "EXPLORATION", "ABC: exploration layout");
assert(abcView.provenance === "MIXED", "ABC: mixed provenance");
assert(
  abcView.sections.categories.some((c) => c.label === "Steep Slope Roofing"),
  "ABC: steep slope subcategory"
);
assert(
  abcView.sections.brands.some((b) => b.label === "GAF"),
  "ABC: GAF brand"
);
assert(abcView.sections.products.length === 0, "ABC: no product rows in fixture");

// --- PR1: polluted adapter flat must not surface categories as products ---
const pollutedSiteSearch: SupplierSiteSearchStructured = {
  products: [
    serpRow({
      supplierId: "grainger_hsv",
      title: "Low Slope Roofing",
      classification: "CATEGORY_PAGE",
      productUrl: "https://www.grainger.com/category/roofing",
    }),
    serpRow({
      supplierId: "grainger_hsv",
      title: "#8 Screw",
      classification: "PRODUCT_PAGE",
      productUrl: "https://www.grainger.com/product/123",
    }),
  ],
  categories: [],
  brands: [],
  other: [],
  flat: [],
};

assert(
  resolveStorefrontProducts(pollutedSiteSearch, "grainger_hsv").length === 1,
  "resolveStorefrontProducts: drops category rows from products bucket"
);
assert(
  isStorefrontProduct(pollutedSiteSearch.products[0]!) === false,
  "isStorefrontProduct: rejects CATEGORY_PAGE"
);
assert(
  isStorefrontProduct({
    supplierId: "home_depot_hsv",
    title: "BEHR Paint",
    source: "HOME_DEPOT",
    productUrl: "https://www.homedepot.com/p/1",
  }),
  "isStorefrontProduct: allows HD rows without classification"
);
assert(
  isStorefrontProduct({
    supplierId: "lowes_hsv",
    title: "Valspar Paint",
    source: "LOWES",
    productUrl: "https://www.lowes.com/pd/1",
  }),
  "isStorefrontProduct: allows Lowe's rows without classification"
);

const pollutedView = assembleSupplierStorefrontView(
  {
    query: "roofing",
    productSearchQuery: "roofing",
    categoryId: "roofing",
    categoryLabel: "Roofing",
    supplier: {
      id: "grainger_hsv",
      name: "Grainger",
      logoUrl: null,
      city: "Huntsville",
      state: "AL",
      websiteUrl: "https://www.grainger.com",
    },
    searchMode: "BROAD",
  },
  {
    capabilityAggregate: null,
    siteSearch: pollutedSiteSearch,
  }
);

assert(
  pollutedView.sections.products.length === 1 &&
    pollutedView.sections.products[0]?.title === "#8 Screw",
  "storefront view: only true products in products section"
);

// --- Grainger + Fasteners ---
const graingerView = assembleSupplierStorefrontView(
  {
    query: "fasteners",
    productSearchQuery: "fasteners",
    categoryId: "hardware_fasteners",
    categoryLabel: "Fasteners & Hardware",
    supplier: {
      id: "grainger_hsv",
      name: "Grainger",
      logoUrl: null,
      city: "Huntsville",
      state: "AL",
      websiteUrl: "https://www.grainger.com",
    },
    searchMode: "BROAD",
  },
  {
    capabilityAggregate: aggregateSupplierCapabilitiesFromRows("grainger_hsv", [
      {
        categoryId: "hardware_fasteners",
        subcategory: "Fasteners",
        brand: "Grainger Approved",
        sourceUrl: "https://grainger.com",
      },
    ]),
    siteSearch: {
      products: [
        serpRow({
          title: "#8 Screw",
          classification: "PRODUCT_PAGE",
          productUrl: "https://www.grainger.com/product/123",
        }),
      ],
      categories: [
        serpRow({
          title: "Fasteners Category",
          classification: "CATEGORY_PAGE",
          productUrl: "https://www.grainger.com/category/fasteners",
        }),
      ],
      brands: [],
      other: [],
      flat: [],
    },
  }
);

assert(graingerView.sections.products.length === 1, "Grainger: one product");
assert(
  !graingerView.sections.products.some((p) => p.title === "Fasteners Category"),
  "Grainger: category Serp row stays out of products"
);
assert(
  graingerView.sections.categories.some((c) => c.label === "Fasteners"),
  "Grainger: capability fasteners subcategory"
);

// --- Ferguson + Pipe ---
const fergusonView = assembleSupplierStorefrontView(
  {
    query: "pipe",
    productSearchQuery: "pipe",
    categoryId: "plumbing",
    categoryLabel: "Plumbing",
    supplier: {
      id: "ferguson_plumbing_hsv",
      name: "Ferguson Plumbing Supply",
      logoUrl: null,
      city: "Huntsville",
      state: "AL",
      websiteUrl: "https://www.ferguson.com",
    },
    searchMode: "BROAD",
  },
  {
    capabilityAggregate: aggregateSupplierCapabilitiesFromRows("ferguson_plumbing_hsv", [
      {
        categoryId: "plumbing",
        subcategory: "PVC Pipe",
        brand: "CHARLOTTE PIPE",
        sourceUrl: "https://ferguson.com",
      },
    ]),
    siteSearch: {
      products: [],
      categories: [],
      brands: [
        serpRow({
          supplierId: "ferguson_plumbing_hsv",
          title: "Charlotte Pipe",
          classification: "BRAND_PAGE",
          productUrl: "https://www.ferguson.com/brand/charlotte",
          source: "FERGUSON",
        }),
      ],
      other: [],
      flat: [],
    },
  }
);

assert(
  fergusonView.sections.brands.some((b) => b.label === "CHARLOTTE PIPE"),
  "Ferguson: capability brand"
);
assert(fergusonView.sections.products.length === 0, "Ferguson: no products in fixture");

// --- Home Depot + Paint (adapter-shaped: products only) ---
const hdView = assembleSupplierStorefrontView(
  {
    query: "paint",
    productSearchQuery: "paint",
    categoryId: "paint",
    categoryLabel: "Paint & Coatings",
    supplier: {
      id: "home_depot_hsv",
      name: "The Home Depot",
      logoUrl: null,
      city: "Huntsville",
      state: "AL",
      websiteUrl: "https://www.homedepot.com",
    },
    searchMode: "BROAD",
  },
  {
    capabilityAggregate: aggregateSupplierCapabilitiesFromRows("home_depot_hsv", []),
    siteSearch: {
      products: [
        serpRow({
          supplierId: "home_depot_hsv",
          title: "BEHR Premium Plus Interior Paint",
          source: "HOME_DEPOT",
          price: "$32.98",
          productUrl: "https://www.homedepot.com/p/1",
        }),
      ],
      categories: [],
      brands: [],
      other: [],
      flat: [],
    },
  }
);

assert(hdView.sections.products.length === 1, "HD: adapter product row");
assert(hdView.sections.brands.length === 0, "HD: no capability brands");
assert(hdView.provenance === "SERP", "HD: serp-only provenance");

// --- Exact PVC pipe ---
const exactView = assembleSupplierStorefrontView(
  {
    query: "2 inch schedule 40 pvc pipe 10 ft",
    productSearchQuery: "2 inch schedule 40 pvc pipe 10 ft",
    categoryId: "plumbing",
    categoryLabel: "Plumbing",
    supplier: {
      id: "ferguson_plumbing_hsv",
      name: "Ferguson Plumbing Supply",
      logoUrl: null,
      city: "Huntsville",
      state: "AL",
      websiteUrl: "https://www.ferguson.com",
    },
    searchMode: "EXACT",
  },
  {
    capabilityAggregate: null,
    siteSearch: {
      products: [
        serpRow({
          supplierId: "ferguson_plumbing_hsv",
          title: "2 in x 10 ft PVC Pipe Schedule 40",
          classification: "PRODUCT_PAGE",
          source: "FERGUSON",
        }),
      ],
      categories: [],
      brands: [],
      other: [],
      flat: [],
    },
  }
);

assert(exactView.layoutMode === "PRODUCT_FIRST", "Exact: product-first layout");
assert(
  exactView.sections.extractedAttributes.some((a) => a.key === "material" && a.value === "PVC"),
  "Exact: PVC attribute"
);
assert(
  exactView.sections.extractedAttributes.some((a) => a.key === "diameter"),
  "Exact: diameter attribute"
);
assert(exactView.sections.products.length === 1, "Exact: one product");

// --- Empty data matches PR1 skeleton ---
const emptyView = assembleSupplierStorefrontView(
  {
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
    searchMode: "BROAD",
  },
  EMPTY_STOREFRONT_BUILD_DATA
);

assert(emptyView.provenance === "NONE", "empty: provenance none");
assert(emptyView.sections.brands.length === 0, "empty: no brands");
assert(emptyView.sections.capabilityProfiles.length === 0, "empty: no capability profiles");

const profileOnlyView = assembleSupplierStorefrontView(
  {
    query: "asphalt shingles",
    productSearchQuery: "asphalt shingles",
    categoryId: "roofing",
    categoryLabel: "Roofing",
    supplier: baseSupplier,
    searchMode: "REFINED",
  },
  {
    ...EMPTY_STOREFRONT_BUILD_DATA,
    capabilityProfiles: [
      {
        supplierId: "abc_supply_hsv",
        title: "Likely carries: Atlas — Asphalt Shingles",
        brand: "Atlas",
        imageUrl: null,
        price: null,
        productUrl: "https://www.abcsupply.com/products/",
        source: "ABC_SUPPLY",
        availability: "Likely carries",
        classification: "BRAND_PAGE",
        rankingSignals: [
          "capability_profile",
          "inferred_match",
          "no_live_inventory",
        ],
      },
    ],
  }
);
assert(
  profileOnlyView.sections.capabilityProfiles.length === 1,
  "capability profiles section populated"
);
assert(
  profileOnlyView.sections.products.length === 0,
  "profile rows never land in products section"
);
assert(
  !profileOnlyView.sections.products.some((p) =>
    p.title.startsWith("Likely carries:")
  ),
  "products section excludes profile titles"
);

console.log("\nAll buildSupplierStorefrontView tests passed.\n");
