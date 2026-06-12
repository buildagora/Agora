import type { CapabilitySearchResult } from "@/lib/search/capabilitySearch";
import { mapCapabilityMatchesToProfileResults } from "../mapCapabilityProfileResults";
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

function sampleMatch(
  overrides: Partial<CapabilitySearchResult> = {}
): CapabilitySearchResult {
  return {
    supplierId: "ferguson_wdc",
    categoryId: "plumbing",
    subcategory: "Copper Pipe",
    brand: "Mueller",
    productLine: "Type L Copper",
    sourceUrl: "https://ferguson.com/category/copper",
    score: 18,
    ...overrides,
  };
}

console.log("\nmapCapabilityProfileResults tests\n");

const mapped = mapCapabilityMatchesToProfileResults([sampleMatch()], {
  supplierId: "ferguson_wdc",
  source: "FERGUSON",
});

assert(mapped.length === 1, "maps one capability row");
const row = mapped[0]!;

assert(
  row.title.startsWith("Likely carries:"),
  "title uses Likely carries prefix"
);
assert(row.title.includes("Mueller"), "title includes brand");
assert(row.title.includes("Type L Copper"), "title includes product line");
assert(row.price === null, "price is always null");
assert(row.imageUrl === null, "imageUrl is always null");
assert(row.classification === "BRAND_PAGE", "brand present → BRAND_PAGE");
assert(row.classification !== "PRODUCT_PAGE", "never PRODUCT_PAGE");
assert(row.availability === "Likely carries", "availability is Likely carries");
assert(
  row.productUrl === "https://ferguson.com/category/copper",
  "productUrl is capability evidence URL only"
);
assert(row.score === 18, "preserves capability score");
assert(
  CAPABILITY_PROFILE_RANKING_SIGNALS.every((s) =>
    row.rankingSignals?.includes(s)
  ),
  "includes capability profile ranking signals"
);
assert(isCapabilityProfileResult(row), "isCapabilityProfileResult guard passes");

const categoryOnly = mapCapabilityMatchesToProfileResults(
  [sampleMatch({ brand: "" })],
  { supplierId: "ferguson_wdc", source: "GENERIC" }
)[0]!;
assert(
  categoryOnly.classification === "CATEGORY_PAGE",
  "no brand → CATEGORY_PAGE"
);

const noFabricatedFields = Object.keys(row);
assert(!noFabricatedFields.includes("sku"), "no SKU field fabricated");
assert(!noFabricatedFields.includes("inventory"), "no inventory field fabricated");

console.log("\nAll mapCapabilityProfileResults tests passed.\n");
