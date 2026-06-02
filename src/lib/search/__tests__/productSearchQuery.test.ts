/**
 * Product search query normalization tests.
 * Run: npx tsx src/lib/search/__tests__/productSearchQuery.test.ts
 */

import {
  extractProductSearchTerms,
  fieldMatchesSearchTerm,
  toProductSearchQuery,
} from "../productSearchQuery";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nproductSearchQuery tests\n");

assert(
  toProductSearchQuery("Can you help me find a 2x4") === "2x4",
  "strips conversational filler for lumber dimensions"
);
assert(
  toProductSearchQuery("I need help finding a sink") === "sink",
  "strips filler for plumbing"
);
assert(
  toProductSearchQuery("Looking for shingles") === "shingles",
  "keeps roofing product terms"
);
assert(toProductSearchQuery("Need paint") === "paint", "keeps paint intent");
assert(
  toProductSearchQuery("I need drywall") === "drywall",
  "keeps drywall intent"
);

const lumberTerms = extractProductSearchTerms("2x4", {
  originalQuery: "Can you help me find a 2x4",
});
assert(lumberTerms.includes("2x4"), "includes dimension token");
assert(!lumberTerms.includes("can"), "excludes stop word can");
assert(!lumberTerms.includes("you"), "excludes stop word you");
assert(!lumberTerms.includes("help"), "excludes stop word help");
assert(!lumberTerms.includes("find"), "excludes stop word find");

assert(
  !fieldMatchesSearchTerm("vulcan", "can"),
  "blocks can in vulcan"
);
assert(
  !fieldMatchesSearchTerm("american", "can"),
  "blocks can in american"
);
assert(
  fieldMatchesSearchTerm("2x4 stud kiln dried", "2x4"),
  "matches dimensional lumber"
);
assert(
  fieldMatchesSearchTerm("bathroom sink vanity", "sink"),
  "matches sink substring"
);

console.log("\nAll productSearchQuery tests passed.\n");
