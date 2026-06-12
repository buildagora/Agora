/**
 * Structured supplier site search tests (PR 4).
 * Run: npm run test:supplier-site-structured
 */

import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import {
  dedupeSupplierSiteRows,
  mergeSupplierSiteSearchFlatRows,
} from "../mergeSupplierSiteSearchRows";
import type { SupplierProductResult } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function row(
  partial: Partial<SupplierProductResult> & Pick<SupplierProductResult, "title" | "productUrl">
): SupplierProductResult {
  return {
    supplierId: "grainger_hsv",
    brand: null,
    imageUrl: "https://example.com/img.jpg",
    price: null,
    availability: null,
    source: "GRAINGER",
    ...partial,
  };
}

console.log("\nsearchSupplierSiteStructured tests\n");

assert(classifyUrl("https://www.ferguson.com/brand/kohler") === "BRAND_PAGE", "ferguson brand URL");
assert(classifyUrl("https://www.grainger.com/category/fasteners") === "CATEGORY_PAGE", "grainger category URL");
assert(classifyUrl("https://www.grainger.com/product/ABC123") === "PRODUCT_PAGE", "grainger product URL");
assert(classifyUrl("https://www.abcsupply.com/products/") === "PRODUCT_PAGE", "abc /products/ path");

const product = row({
  title: "Product A",
  productUrl: "https://grainger.com/product/a",
  classification: "PRODUCT_PAGE",
});
const category = row({
  title: "Fasteners",
  productUrl: "https://grainger.com/category/fasteners",
  classification: "CATEGORY_PAGE",
});
const brand = row({
  title: "Milwaukee",
  productUrl: "https://grainger.com/brand/milwaukee",
  classification: "BRAND_PAGE",
});
const other = row({
  title: "About Tools",
  productUrl: "https://grainger.com/content/tools",
  classification: "HOMEPAGE",
});

const mapped = [product, category, brand, other];
const flat = mergeSupplierSiteSearchFlatRows([product], [category], mapped, "Product A");

assert(flat.length === 4, "flat merge includes all unique rows");
assert(flat[0].title === "Product A", "flat prefers product section first");
assert(
  flat.some((r) => r.classification === "BRAND_PAGE"),
  "flat includes brand row from mapped"
);

const productsOnly = dedupeSupplierSiteRows([product, product]);
assert(productsOnly.length === 1, "dedupe collapses duplicate keys");

const structuredFromBuckets = {
  products: dedupeSupplierSiteRows([product]),
  categories: dedupeSupplierSiteRows([category]),
  brands: dedupeSupplierSiteRows([brand]),
  other: dedupeSupplierSiteRows([other]),
  flat,
};

assert(structuredFromBuckets.products.length === 1, "structured products bucket");
assert(structuredFromBuckets.categories.length === 1, "structured categories bucket");
assert(structuredFromBuckets.brands.length === 1, "structured brands bucket");
assert(structuredFromBuckets.other.length === 1, "structured other bucket");
assert(
  structuredFromBuckets.flat.length === flat.length,
  "structured flat matches legacy merge"
);

console.log("\nAll searchSupplierSiteStructured tests passed.\n");
