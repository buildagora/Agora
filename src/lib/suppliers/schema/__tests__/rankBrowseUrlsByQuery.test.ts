import {
  getSubcategoryExpansionSeedUrls,
  meetsBrowseRelevance,
  rankBrowseUrlsByQuery,
  scoreBrowseUrlForQuery,
} from "../rankBrowseUrlsByQuery";
import { expandBrowseQueryTokens } from "@/lib/search/browse/expandBrowseQueryTokens";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nrankBrowseUrlsByQuery tests\n");

const wittichenUrls = [
  "https://www.wittichen-supply.com/products/",
  "https://www.wittichen-supply.com/products/residential-equipment/",
  "https://www.wittichen-supply.com/products/hvac-parts/",
  "https://www.wittichen-supply.com/products/refrigerants-tanks/",
  "https://www.wittichen-supply.com/products/hvac-parts/thermostats/",
  "https://www.wittichen-supply.com/about-us/",
];

const furnaceRanked = rankBrowseUrlsByQuery(wittichenUrls, "furnace");
assert(furnaceRanked.length > 0, "furnace query ranks at least one url");
assert(
  furnaceRanked[0]?.url.includes("residential-equipment"),
  "furnace prefers residential-equipment via browse alias"
);
assert(
  furnaceRanked[0]?.aliasSourceProductType === "furnace",
  "furnace aliasSourceProductType is furnace"
);
assert(
  furnaceRanked[0]?.aliasMatchType === "path_alias",
  "furnace aliasMatchType is path_alias"
);
assert(
  !furnaceRanked.some((entry) => entry.url.endsWith("/products/")),
  "generic /products/ root rejected"
);

const condenserRanked = rankBrowseUrlsByQuery(wittichenUrls, "condenser");
assert(
  condenserRanked[0]?.url.includes("residential-equipment") ||
    condenserRanked[0]?.url.includes("mini-split"),
  "condenser maps to cooling equipment path"
);

const thermostatDirect = scoreBrowseUrlForQuery(
  "https://www.wittichen-supply.com/products/hvac-parts/thermostats/",
  expandBrowseQueryTokens("thermostat")
);
assert(
  thermostatDirect.score >= 0.25,
  "thermostat subcategory path has direct lexical score"
);

const thermostatSeeds = getSubcategoryExpansionSeedUrls(
  wittichenUrls,
  "thermostat",
  rankBrowseUrlsByQuery(wittichenUrls, "thermostat")
);
assert(
  thermostatSeeds.some((url) => url.includes("hvac-parts")),
  "thermostat seeds hvac-parts for one-hop expansion"
);

assert(
  meetsBrowseRelevance(
    furnaceRanked[0]!.score,
    "Residential Equipment | Wittichen Supply",
    "furnace",
    furnaceRanked[0]!.url,
    furnaceRanked[0]
  ),
  "furnace category browse passes lowered threshold"
);

assert(
  !meetsBrowseRelevance(
    0.15,
    "Unrelated Page",
    "furnace",
    "https://www.example.com/product/abc-12345",
    undefined
  ),
  "zero-overlap blind 0.15 does not pass relevance gate"
);

const refrigerantRanked = rankBrowseUrlsByQuery(wittichenUrls, "refrigerant");
assert(
  refrigerantRanked[0]?.url.includes("refrigerants-tanks"),
  "refrigerant query alias maps to refrigerants-tanks"
);

console.log("\nAll rankBrowseUrlsByQuery tests passed.\n");
