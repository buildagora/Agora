import type { RenderingProbeCohortRow } from "../renderingProbeCohort.server";
import {
  assessCityElectric,
  getProvenTierFlags,
  isHigherTierProven,
  rankPlaywrightCandidates,
  scoreRenderingProbeCohortPriority,
  selectRenderingProbeCohort,
} from "../renderingProbeCohort.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function baseRow(
  overrides: Partial<RenderingProbeCohortRow> = {}
): RenderingProbeCohortRow {
  return {
    supplierId: "ferguson_plumbing_hsv",
    supplierName: "Ferguson",
    canonicalDomain: "ferguson.com",
    renderingType: "UNKNOWN",
    isSPA: null,
    antiBotRisk: "UNKNOWN",
    demandPriority: "LOW",
    demandScore: null,
    hasSitemap: true,
    hasSchemaMarkup: false,
    detectedPlatform: "UNKNOWN",
    platformAccessStatus: "NOT_APPLICABLE",
    publicApiAccessStatus: "NOT_PROBED",
    allowSerpFallback: true,
    legacySnapshot: {
      matchKind: "site_organic",
      mode: "site_organic",
      domain: "ferguson.com",
    },
    ...overrides,
  };
}

console.log("\nrenderingProbeCohort tests\n");

assert(
  isHigherTierProven(
    baseRow({
      supplierId: "abc_supply_hsv",
      legacySnapshot: { matchKind: "site_organic", mode: "site_organic" },
    })
  ),
  "schema allowlist counts as higher tier proven"
);

assert(
  !isHigherTierProven(baseRow({ supplierId: "ferguson_plumbing_hsv" })),
  "ferguson not higher tier proven"
);

const cohort = selectRenderingProbeCohort(
  [
    baseRow({ supplierId: "abc_supply_hsv" }),
    baseRow({ supplierId: "ferguson_plumbing_hsv" }),
    baseRow({ supplierId: "city_electric_hsv", canonicalDomain: "cityelectricsupply.com" }),
    baseRow({
      supplierId: "lansing_hsv",
      canonicalDomain: "lansingbp.com",
      hasSitemap: false,
    }),
  ],
  10
);

assert(
  cohort.some((row) => row.supplierId === "city_electric_hsv"),
  "cohort includes city electric anchor"
);
assert(
  !cohort.some((row) => row.supplierId === "abc_supply_hsv"),
  "cohort excludes schema-proven abc"
);

assert(
  scoreRenderingProbeCohortPriority(
    baseRow({ renderingType: "UNKNOWN", allowSerpFallback: true })
  ) >
    scoreRenderingProbeCohortPriority(
      baseRow({ renderingType: "SERVER_RENDERED", allowSerpFallback: false })
    ),
  "unknown rendering + serp fallback scores higher"
);

const ranked = rankPlaywrightCandidates([
  {
    ...baseRow({ supplierId: "spa_candidate_hsv" }),
    probeRenderingType: "SPA",
    probeIsSPA: true,
    probeAntiBotRisk: "LOW",
    demandPriority: "HIGH",
    demandScore: 25,
  },
  {
    ...baseRow({ supplierId: "blocked_hsv" }),
    probeRenderingType: "SPA",
    probeIsSPA: true,
    probeAntiBotRisk: "HARD_BLOCK",
  },
]);

assert(ranked[0]?.supplierId === "spa_candidate_hsv", "spa low antibot ranks first");
assert(ranked.length === 1, "hard block excluded from positive scores");

const cityBlocked = assessCityElectric({
  probeRenderingType: "UNKNOWN",
  probeIsSPA: null,
  probeAntiBotRisk: "HIGH",
  pilotPass: false,
  pilotCloudflareBlocked: true,
  pilotProductCount: 0,
});
assert(
  cityBlocked.recommendedFutureStrategy === "ANTI_BOT_EVALUATION",
  "city electric hard block → anti-bot evaluation"
);
assert(!cityBlocked.playwrightJustified, "city electric playwright not justified");

const citySpa = assessCityElectric({
  probeRenderingType: "SPA",
  probeIsSPA: true,
  probeAntiBotRisk: "LOW",
  pilotPass: true,
  pilotCloudflareBlocked: false,
  pilotProductCount: 6,
});
assert(
  citySpa.recommendedFutureStrategy === "PLAYWRIGHT",
  "hypothetical spa+low antibot+pass → playwright"
);

assert(
  getProvenTierFlags(
    baseRow({ supplierId: "wittichen_hsv" })
  ).htmlScrape,
  "wittichen html scrape proven flag"
);

console.log("\nAll renderingProbeCohort tests passed.\n");
