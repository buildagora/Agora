/**
 * Phase 8D.1 — local search verification for Wave 1 promoted rollout.
 *
 *   npm run fingerprint:phase8d1-search
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { executeSupplierSearch } from "../../src/lib/search/executeSupplierSearch";
import { ROUTER_PROMOTED_SUPPLIERS } from "./phase6bProvenCohortParity";

process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  ROUTER_PROMOTED_SUPPLIERS.join(",");

const LOCATION = {
  label: "Huntsville, AL",
  lat: 34.7304,
  lng: -86.5861,
};


type Expectation = {
  query: string;
  mustInclude?: string[];
  optionalInclude?: string[];
  rankAtMost?: Record<string, number>;
  mustNotInclude?: string[];
};

const EXPECTATIONS: Expectation[] = [
  {
    query: "tile",
    mustInclude: ["floor_decor_hsv"],
    rankAtMost: { floor_decor_hsv: 3 },
  },
  {
    query: "flooring",
    optionalInclude: ["floor_decor_hsv"],
    rankAtMost: { floor_decor_hsv: 15 },
  },
  {
    query: "furnace",
    optionalInclude: ["johnstone_hsv", "trane_supply_hsv", "re_michel_hsv"],
    mustInclude: ["wittichen_hsv"],
    rankAtMost: { wittichen_hsv: 3 },
  },
  {
    query: "hvac",
    mustInclude: ["johnstone_hsv"],
    optionalInclude: ["trane_supply_hsv", "re_michel_hsv"],
    rankAtMost: { johnstone_hsv: 8 },
  },
  {
    query: "air filter",
    mustInclude: ["johnstone_hsv"],
    optionalInclude: ["trane_supply_hsv", "re_michel_hsv"],
    rankAtMost: { johnstone_hsv: 10 },
  },
  {
    query: "shingles",
    mustInclude: ["abc_supply_hsv"],
    optionalInclude: ["gulfeagle_hsv"],
  },
  {
    query: "roofing",
    mustInclude: ["abc_supply_hsv"],
    optionalInclude: ["gulfeagle_hsv"],
  },
  {
    query: "metal roofing",
    optionalInclude: ["gulfeagle_hsv", "abc_supply_hsv"],
  },
  {
    query: "vinyl plank",
    optionalInclude: ["ll_flooring_hsv", "floor_decor_hsv"],
    rankAtMost: { ll_flooring_hsv: 5 },
  },
  {
    query: "irrigation",
    optionalInclude: ["siteone_hsv", "siteone_north_hsv"],
    rankAtMost: { siteone_hsv: 10, siteone_north_hsv: 10 },
  },
  {
    query: "landscape fabric",
    optionalInclude: ["siteone_hsv", "siteone_north_hsv"],
  },
  {
    query: "drainage",
    optionalInclude: ["siteone_hsv", "siteone_north_hsv"],
  },
  {
    query: "fasteners",
    optionalInclude: ["cmn90dbjr000404ldzhcsquav"],
  },
  {
    query: "lumber",
    optionalInclude: ["abc_supply_hsv"],
  },
];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("\n=== Phase 8D.1 Search Verification ===\n");

  for (const expectation of EXPECTATIONS) {
    const pipeline = await executeSupplierSearch({
      query: expectation.query,
      location: LOCATION,
      radiusMiles: 25,
      maxResults: 20,
    });

    const cards = pipeline.cards;
    const ids = cards.map((c) => c.supplierId);
    const rankById = new Map(ids.map((id, i) => [id, i + 1]));

    console.log(`Query: "${expectation.query}"`);
    console.log(`  Top 5: ${ids.slice(0, 5).join(", ") || "(none)"}`);

    for (const id of expectation.mustInclude ?? []) {
      if (!ids.includes(id)) {
        fail(`"${expectation.query}" missing expected supplier ${id}`);
      }
    }

    for (const id of expectation.optionalInclude ?? []) {
      if (!ids.includes(id)) {
        console.log(`  NOTE: optional supplier ${id} not in top ${ids.length}`);
      }
    }

    for (const [id, maxRank] of Object.entries(expectation.rankAtMost ?? {})) {
      const rank = rankById.get(id);
      if (rank != null && rank > maxRank) {
        fail(
          `"${expectation.query}" ${id} rank=${rank} expected <= ${maxRank}`
        );
      }
    }

    for (const id of expectation.mustNotInclude ?? []) {
      if (ids.includes(id)) {
        fail(`"${expectation.query}" unexpectedly includes ${id}`);
      }
    }

    const noDomainErrors = cards.every(
      (c) => c.matchReason !== "no_domain_or_platform"
    );
    if (!noDomainErrors) {
      const bad = cards.filter((c) => c.matchReason === "no_domain_or_platform");
      fail(
        `"${expectation.query}" has no_domain_or_platform: ${bad.map((c) => c.supplierId).join(", ")}`
      );
    }

    console.log("  PASS\n");
  }

  console.log("All Phase 8D.1 search verification checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
