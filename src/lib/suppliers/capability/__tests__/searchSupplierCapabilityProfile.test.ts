import type { CapabilitySearchResult } from "@/lib/search/capabilitySearch";
import {
  CAPABILITY_MAX_ROWS_PER_SUPPLIER,
} from "@/lib/search/capabilitySearch";
import { searchSupplierCapabilityProfile } from "../searchSupplierCapabilityProfile";

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
    subcategory: "pipe",
    brand: "Mueller",
    productLine: "Copper Pipe",
    sourceUrl: "https://example.com/capability",
    score: 12,
    ...overrides,
  };
}

console.log("\nsearchSupplierCapabilityProfile tests\n");

async function main() {
  let capturedSupplierId: string | undefined;
  let capturedQuery: string | undefined;

  const matches = await searchSupplierCapabilityProfile("ferguson_wdc", "copper pipe", {
    searchCapabilitiesFn: async (query, options) => {
      capturedQuery = query;
      capturedSupplierId = options?.supplierId;
      return [
        sampleMatch(),
        sampleMatch({ supplierId: "other_supplier", score: 20 }),
      ];
    },
  });

  assert(capturedQuery === "copper pipe", "forwards query to searchCapabilities");
  assert(
    capturedSupplierId === "ferguson_wdc",
    "passes supplierId scope to searchCapabilities"
  );
  assert(matches.length === 1, "filters to requested supplierId only");
  assert(matches[0]?.supplierId === "ferguson_wdc", "supplier match retained");

  const empty = await searchSupplierCapabilityProfile("ferguson_wdc", "xyz-none", {
    searchCapabilitiesFn: async () => [],
  });
  assert(empty.length === 0, "no match → empty array");

  const belowThreshold = await searchSupplierCapabilityProfile(
    "ferguson_wdc",
    "weak",
    {
      searchCapabilitiesFn: async () => [],
    }
  );
  assert(
    belowThreshold.length === 0,
    "threshold filtering delegated to searchCapabilities (no matches returned)"
  );

  const capped = await searchSupplierCapabilityProfile("ferguson_wdc", "pipe", {
    searchCapabilitiesFn: async () =>
      Array.from({ length: CAPABILITY_MAX_ROWS_PER_SUPPLIER + 2 }, (_, i) =>
        sampleMatch({ score: 10 + i, productLine: `Line ${i}` })
      ).slice(0, CAPABILITY_MAX_ROWS_PER_SUPPLIER),
  });
  assert(
    capped.length === CAPABILITY_MAX_ROWS_PER_SUPPLIER,
    "respects max rows when searchCapabilities caps output"
  );

  const blankId = await searchSupplierCapabilityProfile("", "pipe", {
    searchCapabilitiesFn: async () => {
      throw new Error("should not call search");
    },
  });
  assert(blankId.length === 0, "blank supplierId → empty without search");

  console.log("\nAll searchSupplierCapabilityProfile tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
