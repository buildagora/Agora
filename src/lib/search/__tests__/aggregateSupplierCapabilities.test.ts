/**
 * Supplier capability aggregation tests (PR 3).
 * Run: npm run test:capability-aggregate
 */

import { aggregateSupplierCapabilitiesFromRows } from "../storefront/aggregateSupplierCapabilitiesFromRows";
import type { SupplierCapabilityRow } from "../storefront/capabilityAggregateTypes";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

/** Representative ABC Supply roofing rows (subset of seed). */
const ABC_ROWS: SupplierCapabilityRow[] = [
  {
    categoryId: "roofing",
    subcategory: "Steep Slope Roofing",
    brand: "",
    sourceUrl: "https://www.abcsupply.com/products/",
    confidence: "HIGH",
  },
  {
    categoryId: "roofing",
    subcategory: "Asphalt Shingles",
    brand: "GAF",
    sourceUrl: "https://www.abcsupply.com/products/",
    confidence: "HIGH",
  },
  {
    categoryId: "roofing",
    subcategory: "Asphalt Shingles",
    brand: "CertainTeed",
    sourceUrl: "https://www.abcsupply.com/products/",
    confidence: "HIGH",
  },
  {
    categoryId: "roofing",
    subcategory: "Asphalt Shingles",
    brand: "GAF",
    sourceUrl: "https://www.abcsupply.com/products/",
    confidence: "HIGH",
  },
  {
    categoryId: "roofing",
    subcategory: "Metal Roofing",
    brand: "Fabral",
    sourceUrl: "https://www.abcsupply.com/products/",
    confidence: "HIGH",
  },
];

/** Representative Grainger rows (subset of seed). */
const GRAINGER_ROWS: SupplierCapabilityRow[] = [
  {
    categoryId: "hardware_fasteners",
    subcategory: "Fasteners",
    brand: "Grainger Approved",
    sourceUrl: "https://grainger.com",
    confidence: "MEDIUM",
  },
  {
    categoryId: "hardware_fasteners",
    subcategory: "Fastener Anchors",
    brand: "Simpson Strong-Tie",
    sourceUrl: "https://grainger.com",
    confidence: "MEDIUM",
  },
  {
    categoryId: "electrical",
    subcategory: "Electric Motors",
    brand: "Dayton",
    sourceUrl: "https://grainger.com",
    confidence: "MEDIUM",
  },
  {
    categoryId: "tools_equipment",
    subcategory: "Power Tools",
    brand: "Milwaukee Tool",
    sourceUrl: "https://grainger.com",
    confidence: "MEDIUM",
  },
];

/** Representative Ferguson plumbing rows (subset of seed). */
const FERGUSON_ROWS: SupplierCapabilityRow[] = [
  {
    categoryId: "plumbing",
    subcategory: "Toilet",
    brand: "KOHLER",
    sourceUrl: "https://ferguson.com",
    confidence: "MEDIUM",
  },
  {
    categoryId: "plumbing",
    subcategory: "Toilet",
    brand: "KOHLER",
    sourceUrl: "https://ferguson.com",
    confidence: "MEDIUM",
  },
  {
    categoryId: "plumbing",
    subcategory: "PVC Pipe",
    brand: "CHARLOTTE PIPE",
    sourceUrl: "https://ferguson.com",
    confidence: "MEDIUM",
  },
  {
    categoryId: "plumbing",
    subcategory: "Bathroom Faucet",
    brand: "Delta Faucet",
    sourceUrl: "https://ferguson.com",
    confidence: "MEDIUM",
  },
];

console.log("\naggregateSupplierCapabilities tests\n");

const abc = aggregateSupplierCapabilitiesFromRows("abc_supply_hsv", ABC_ROWS);
assert(abc.brands.length === 3, "ABC: deduped brands");
assert(
  abc.brands.map((b) => b.label).includes("GAF"),
  "ABC: includes GAF"
);
assert(
  abc.subcategories.some((s) => s.label === "Asphalt Shingles"),
  "ABC: asphalt subcategory"
);
assert(
  abc.subcategories.some((s) => s.label === "Steep Slope Roofing"),
  "ABC: steep slope subcategory without brand"
);
assert(abc.categories.length === 1 && abc.categories[0].categoryId === "roofing", "ABC: one category");
assert(
  !Object.prototype.hasOwnProperty.call(abc.brands[0], "productCount"),
  "ABC: no productCount on brands"
);

const grainger = aggregateSupplierCapabilitiesFromRows("grainger_hsv", GRAINGER_ROWS);
assert(grainger.brands.length === 4, "Grainger: four brands");
assert(
  grainger.subcategories.some((s) => s.label === "Fasteners"),
  "Grainger: fasteners subcategory"
);
assert(grainger.categories.length >= 2, "Grainger: multiple marketplace categories");

const ferguson = aggregateSupplierCapabilitiesFromRows(
  "ferguson_plumbing_hsv",
  FERGUSON_ROWS
);
assert(ferguson.brands.length === 3, "Ferguson: deduped KOHLER");
assert(
  ferguson.subcategories.some((s) => s.label === "PVC Pipe"),
  "Ferguson: PVC Pipe subcategory"
);
assert(ferguson.categories[0].label === "Plumbing", "Ferguson: plumbing category label");

const hd = aggregateSupplierCapabilitiesFromRows("home_depot_hsv", []);
assert(hd.brands.length === 0, "Home Depot: no brands without rows");
assert(hd.subcategories.length === 0, "Home Depot: no subcategories");
assert(hd.categories.length === 0, "Home Depot: no categories");

const roofingOnly = aggregateSupplierCapabilitiesFromRows("grainger_hsv", GRAINGER_ROWS, {
  categoryId: "hardware_fasteners",
});
assert(roofingOnly.categories.length === 1, "category filter: one category");
assert(
  roofingOnly.categories[0].categoryId === "hardware_fasteners",
  "category filter: hardware_fasteners"
);
assert(roofingOnly.brands.every((b) => b.categoryIds.includes("hardware_fasteners")), "category filter: brands scoped");

console.log("\nAll aggregateSupplierCapabilities tests passed.\n");
