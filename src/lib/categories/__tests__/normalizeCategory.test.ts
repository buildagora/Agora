/**
 * Category Normalization Tests
 * Simple test script for normalizeCategory and sellerServesCategory functions
 * Run with: npx tsx src/lib/categories/__tests__/normalizeCategory.test.ts
 */

import { normalizeCategory, sellerServesCategory } from "../normalizeCategory";
import type { CategoryId } from "@/lib/categoryIds";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log("\n🧪 Testing Category Normalization\n");

// Test normalizeCategory
console.log("Testing normalizeCategory:");
assert(normalizeCategory("roofing") === "roofing", "normalizeCategory('roofing') === 'roofing'");
assert(normalizeCategory("hvac") === "hvac", "normalizeCategory('hvac') === 'hvac'");
assert(normalizeCategory("plumbing") === "plumbing", "normalizeCategory('plumbing') === 'plumbing'");
assert(normalizeCategory("Roofing") === "roofing", "normalizeCategory('Roofing') === 'roofing' (case-insensitive)");
assert(normalizeCategory("ROOFING") === "roofing", "normalizeCategory('ROOFING') === 'roofing' (uppercase)");
assert(normalizeCategory("HVAC") === "hvac", "normalizeCategory('HVAC') === 'hvac'");
assert(normalizeCategory("Plumbing") === "plumbing", "normalizeCategory('Plumbing') === 'plumbing'");
assert(normalizeCategory("lumber / siding") === "lumber_siding", "normalizeCategory('lumber / siding') === 'lumber_siding'");
assert(normalizeCategory("lumber/siding") === "lumber_siding", "normalizeCategory('lumber/siding') === 'lumber_siding'");
assert(normalizeCategory("invalid_category") === null, "normalizeCategory('invalid_category') === null");
assert(normalizeCategory("") === null, "normalizeCategory('') === null");
assert(normalizeCategory(null as any) === null, "normalizeCategory(null) === null");
assert(normalizeCategory(undefined as any) === null, "normalizeCategory(undefined) === null");

// Test sellerServesCategory
console.log("\nTesting sellerServesCategory:");
const sellerCategories1 = ["roofing", "hvac"];
assert(sellerServesCategory(sellerCategories1, "roofing" as CategoryId) === true, "sellerServesCategory(['roofing', 'hvac'], 'roofing') === true");
assert(sellerServesCategory(sellerCategories1, "hvac" as CategoryId) === true, "sellerServesCategory(['roofing', 'hvac'], 'hvac') === true");
assert(sellerServesCategory(sellerCategories1, "plumbing" as CategoryId) === false, "sellerServesCategory(['roofing', 'hvac'], 'plumbing') === false");

const sellerCategories2 = ["Roofing", "HVAC"];
assert(sellerServesCategory(sellerCategories2, "roofing" as CategoryId) === true, "sellerServesCategory(['Roofing', 'HVAC'], 'roofing') === true (label match)");
assert(sellerServesCategory(sellerCategories2, "hvac" as CategoryId) === true, "sellerServesCategory(['Roofing', 'HVAC'], 'hvac') === true (label match)");

assert(sellerServesCategory([], "roofing" as CategoryId) === false, "sellerServesCategory([], 'roofing') === false");
assert(sellerServesCategory(null, "roofing" as CategoryId) === false, "sellerServesCategory(null, 'roofing') === false");
assert(sellerServesCategory(undefined, "roofing" as CategoryId) === false, "sellerServesCategory(undefined, 'roofing') === false");

console.log("\n✅ All tests passed!\n");
