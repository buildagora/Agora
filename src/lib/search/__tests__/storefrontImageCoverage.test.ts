/**
 * Storefront image Phase 1a tests + coverage report.
 * Run: npm run test:storefront-images
 */

import { aggregateSupplierCapabilitiesFromRows } from "../storefront/aggregateSupplierCapabilitiesFromRows";
import type { SupplierCapabilityRow } from "../storefront/capabilityAggregateTypes";
import {
  enrichNavItemsWithSerpImages,
  mapStorefrontSections,
} from "../storefront/mapStorefrontBuildData";
import { resolveStorefrontDisplayImage } from "../storefront/resolveStorefrontDisplayImage";
import {
  buildStorefrontImageCoverageReport,
  formatStorefrontImageCoverageReport,
} from "../storefront/storefrontImageCoverage";
import {
  buildStorefrontVisualReliabilityReport,
  formatVisualReliabilityReport,
} from "../storefront/storefrontVisualReliability";
import type { SupplierSiteSearchStructured } from "@/lib/suppliers/searchSupplierSiteTypes";
import type { SupplierProductResult } from "@/lib/suppliers/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function serpRow(
  partial: Partial<SupplierProductResult> & Pick<SupplierProductResult, "title">
): SupplierProductResult {
  return {
    supplierId: partial.supplierId ?? "grainger_hsv",
    brand: null,
    imageUrl: partial.imageUrl ?? "https://cdn.example.com/safe.jpg",
    price: null,
    productUrl: partial.productUrl ?? "https://example.com/page",
    source: partial.source ?? "GRAINGER",
    availability: null,
    ...partial,
  };
}

console.log("\nstorefront image Phase 1a tests\n");

// --- merge recovery ---
const capabilityBrand = {
  id: "gaf",
  label: "GAF",
  kind: "brand" as const,
  href: null,
  source: "CAPABILITY" as const,
  imageUrl: null,
};

const enriched = enrichNavItemsWithSerpImages(
  [capabilityBrand],
  [
    serpRow({
      supplierId: "abc_supply_hsv",
      title: "GAF",
      classification: "BRAND_PAGE",
      imageUrl: "https://www.abcsupply.com/gaf-logo.jpg",
      source: "ABC_SUPPLY",
    }),
    serpRow({
      supplierId: "abc_supply_hsv",
      title: "GAF",
      classification: "PRODUCT_PAGE",
      imageUrl: "https://www.abcsupply.com/shingle.jpg",
      source: "ABC_SUPPLY",
    }),
  ],
  "brand"
);

assert(
  enriched[0]?.imageUrl === "https://www.abcsupply.com/gaf-logo.jpg",
  "merge recovery: BRAND_PAGE image copied to capability brand"
);

const categoryEnriched = enrichNavItemsWithSerpImages(
  [
    {
      id: "low-slope",
      label: "Low Slope Roofing",
      kind: "category",
      href: null,
      source: "CAPABILITY",
      imageUrl: null,
    },
  ],
  [
    serpRow({
      supplierId: "abc_supply_hsv",
      title: "Low Slope Roofing",
      classification: "CATEGORY_PAGE",
      imageUrl: "https://www.abcsupply.com/low-slope.jpg",
      source: "ABC_SUPPLY",
    }),
  ],
  "category"
);

assert(
  categoryEnriched[0]?.imageUrl === "https://www.abcsupply.com/low-slope.jpg",
  "merge recovery: CATEGORY_PAGE image copied to capability category"
);

// --- resolver ---
const brandRegistry = resolveStorefrontDisplayImage({
  slot: "brand",
  label: "GAF",
  imageUrl: null,
});
assert(brandRegistry.mode === "image" && brandRegistry.source === "brand_registry", "registry: GAF logo");

const brandSerp = resolveStorefrontDisplayImage({
  slot: "brand",
  label: "Southeastern Metals",
  imageUrl: "https://example.com/brand.jpg",
});
assert(
  brandSerp.mode === "image" && brandSerp.source === "serp_recovered",
  "brand: serp image when no registry"
);

const brandTile = resolveStorefrontDisplayImage({
  slot: "brand",
  label: "Southeastern Metals",
  imageUrl: null,
});
assert(brandTile.mode === "brand_tile", "brand: typographic tile when no image");

const categoryRegistry = resolveStorefrontDisplayImage({
  slot: "category",
  label: "Asphalt Shingles",
  imageUrl: null,
});
assert(
  categoryRegistry.mode === "image" && categoryRegistry.source === "category_registry",
  "registry: Asphalt Shingles icon"
);

const productPlaceholder = resolveStorefrontDisplayImage({
  slot: "product",
  label: "Some Product",
  imageUrl: null,
});
assert(
  productPlaceholder.mode === "product_placeholder",
  "product: structured placeholder when no imageUrl"
);

// --- coverage fixtures for six suppliers ---
function capabilityRows(rows: SupplierCapabilityRow[]) {
  return aggregateSupplierCapabilitiesFromRows("supplier", rows, {
    categoryId: rows[0]?.categoryId,
  });
}

function coverageFixture(
  supplierId: string,
  supplierLabel: string,
  capRows: SupplierCapabilityRow[],
  siteSearch: SupplierSiteSearchStructured
) {
  const sections = mapStorefrontSections(
    supplierId,
    capabilityRows(capRows),
    siteSearch
  );
  return buildStorefrontImageCoverageReport({
    supplierId,
    supplierLabel,
    sections,
  });
}

const reports = [
  coverageFixture(
    "abc_supply_hsv",
    "ABC",
    [
      { categoryId: "roofing", subcategory: "Low Slope Roofing", brand: "GAF", sourceUrl: "" },
      { categoryId: "roofing", subcategory: "Asphalt Shingles", brand: "TAMKO", sourceUrl: "" },
      { categoryId: "roofing", subcategory: "Metal Roofing", brand: "SOPREMA", sourceUrl: "" },
    ],
    {
      products: [
        serpRow({
          supplierId: "abc_supply_hsv",
          title: "Timberline HDZ",
          classification: "PRODUCT_PAGE",
          imageUrl: "https://example.com/p.jpg",
          source: "ABC_SUPPLY",
        }),
        serpRow({
          supplierId: "abc_supply_hsv",
          title: "Missing Image SKU",
          classification: "PRODUCT_PAGE",
          imageUrl: null,
          source: "ABC_SUPPLY",
        }),
      ],
      categories: [
        serpRow({
          supplierId: "abc_supply_hsv",
          title: "Low Slope Roofing",
          classification: "CATEGORY_PAGE",
          source: "ABC_SUPPLY",
        }),
      ],
      brands: [
        serpRow({
          supplierId: "abc_supply_hsv",
          title: "GAF",
          classification: "BRAND_PAGE",
          source: "ABC_SUPPLY",
        }),
      ],
      other: [],
      flat: [],
    }
  ),
  coverageFixture(
    "cmn90dbjr000404ldzhcsquav",
    "QXO",
    [
      { categoryId: "roofing", subcategory: "Asphalt Shingles", brand: "CertainTeed", sourceUrl: "" },
      { categoryId: "roofing", subcategory: "Roofing", brand: "IKO", sourceUrl: "" },
    ],
    {
      products: [
        serpRow({
          supplierId: "cmn90dbjr000404ldzhcsquav",
          title: "No Image Product",
          classification: "PRODUCT_PAGE",
          imageUrl: null,
          source: "QXO",
        }),
      ],
      categories: [],
      brands: [],
      other: [],
      flat: [],
    }
  ),
  coverageFixture(
    "grainger_hsv",
    "Grainger",
    [
      {
        categoryId: "hardware_fasteners",
        subcategory: "Fasteners",
        brand: "Milwaukee",
        sourceUrl: "",
      },
    ],
    {
      products: [
        serpRow({
          supplierId: "grainger_hsv",
          title: "#8 Screw",
          classification: "PRODUCT_PAGE",
        }),
      ],
      categories: [
        serpRow({
          supplierId: "grainger_hsv",
          title: "Fasteners",
          classification: "CATEGORY_PAGE",
        }),
      ],
      brands: [],
      other: [],
      flat: [],
    }
  ),
  coverageFixture(
    "ferguson_plumbing_hsv",
    "Ferguson",
    [
      {
        categoryId: "plumbing",
        subcategory: "Pipe",
        brand: "Charlotte Pipe",
        sourceUrl: "",
      },
      { categoryId: "plumbing", subcategory: "Pipe", brand: "KOHLER", sourceUrl: "" },
    ],
    {
      products: [
        serpRow({
          supplierId: "ferguson_plumbing_hsv",
          title: "2 in PVC Pipe",
          classification: "PRODUCT_PAGE",
          source: "FERGUSON",
        }),
      ],
      categories: [
        serpRow({
          supplierId: "ferguson_plumbing_hsv",
          title: "Pipe",
          classification: "CATEGORY_PAGE",
          source: "FERGUSON",
        }),
      ],
      brands: [],
      other: [],
      flat: [],
    }
  ),
  coverageFixture(
    "home_depot_hsv",
    "Home Depot",
    [],
    {
      products: [
        serpRow({
          supplierId: "home_depot_hsv",
          title: "BEHR Paint",
          source: "HOME_DEPOT",
          imageUrl: "https://images.homedepot-static.com/p.jpg",
        }),
        serpRow({
          supplierId: "home_depot_hsv",
          title: "No Thumb",
          source: "HOME_DEPOT",
          imageUrl: null,
        }),
      ],
      categories: [],
      brands: [],
      other: [],
      flat: [],
    }
  ),
  coverageFixture(
    "lowes_hsv",
    "Lowe's",
    [],
    {
      products: [
        serpRow({
          supplierId: "lowes_hsv",
          title: "Valspar Paint",
          source: "LOWES",
          imageUrl: "https://images.lowes.com/p.jpg",
        }),
      ],
      categories: [],
      brands: [],
      other: [],
      flat: [],
    }
  ),
];

assert(
  reports[0]!.brands.withImage >= 1,
  "coverage ABC: at least one brand with image after merge + registry"
);
assert(
  reports[0]!.categories.withImage >= 1,
  "coverage ABC: category image recovered from Serp"
);
assert(reports[4]!.products.withImageUrl === 1, "coverage HD: one product with image");
assert(reports[4]!.products.placeholderTiles === 1, "coverage HD: one placeholder product");

console.log("\n" + formatStorefrontImageCoverageReport(reports));

const abcSections = mapStorefrontSections(
  "abc_supply_hsv",
  capabilityRows([
    { categoryId: "roofing", subcategory: "Low Slope Roofing", brand: "GAF", sourceUrl: "" },
    { categoryId: "roofing", subcategory: "Asphalt Shingles", brand: "TAMKO", sourceUrl: "" },
  ]),
  {
    products: [
      serpRow({
        supplierId: "abc_supply_hsv",
        title: "Timberline HDZ",
        classification: "PRODUCT_PAGE",
        imageUrl: "https://example.com/p.jpg",
        source: "ABC_SUPPLY",
      }),
    ],
    categories: [],
    brands: [],
    other: [],
    flat: [],
  }
);

const reliabilityReport = buildStorefrontVisualReliabilityReport({
  supplierId: "abc_supply_hsv",
  supplierLabel: "ABC",
  sections: abcSections,
  supplierLogoUrl: "/supplier-logos/abc_supply_hsv.png",
  coverage: reports[0]!,
});

assert(
  reliabilityReport.overallVisualScore >= 0 &&
    reliabilityReport.overallVisualScore <= 100,
  "visual reliability score in range"
);
assert(
  reliabilityReport.brandLogoScore >= 50,
  "ABC fixture brands score reasonably with GAF/TAMKO registry"
);
assert(
  reliabilityReport.tier.endsWith("_VISUAL_CONFIDENCE"),
  "visual reliability tier assigned"
);

console.log("\n" + formatVisualReliabilityReport([reliabilityReport]));

console.log("\nAll storefront image tests passed.\n");
