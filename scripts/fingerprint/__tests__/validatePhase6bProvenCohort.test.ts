import {
  buildParityCsvRows,
  buildParityReportSummary,
  buildSupplierSummaries,
  classifyParityCell,
  recommendSupplierPromotion,
  type ParityCellRecord,
} from "../phase6bProvenCohortParity";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nvalidatePhase6bProvenCohort tests\n");

const passGte = classifyParityCell({
  resultCountLegacy: 2,
  resultCountRouter: 3,
  executionPath: "router",
  finalStrategyUsed: "SCHEMA_OR_SITEMAP",
});
assert(passGte.outcome === "pass", "pass when router count gte legacy");
assert(
  passGte.passReason === "router_count_gte_legacy",
  "pass reason router_count_gte_legacy"
);

const passHigherTier = classifyParityCell({
  resultCountLegacy: 5,
  resultCountRouter: 2,
  executionPath: "router",
  finalStrategyUsed: "HTML_SCRAPE",
});
assert(passHigherTier.outcome === "pass", "pass when higher tier fewer results");
assert(
  passHigherTier.passReason === "higher_tier_success_fewer_results",
  "pass reason higher_tier_success_fewer_results"
);

const failZero = classifyParityCell({
  resultCountLegacy: 4,
  resultCountRouter: 0,
  executionPath: "legacy_fallback",
  chainExhausted: true,
});
assert(failZero.outcome === "fail", "fail when router zero legacy positive");
assert(
  failZero.failReason === "chain_exhausted_zero_results_while_legacy_had_results",
  "fail reason chain exhausted zero"
);

const failEmptyRouterSuccess = classifyParityCell({
  resultCountLegacy: 2,
  resultCountRouter: 0,
  executionPath: "router",
});
assert(failEmptyRouterSuccess.outcome === "fail", "fail chain success empty");
assert(
  failEmptyRouterSuccess.failReason === "chain_success_empty_while_legacy_had_results",
  "fail reason chain success empty"
);

const failFewerNoTier = classifyParityCell({
  resultCountLegacy: 5,
  resultCountRouter: 2,
  executionPath: "router",
  finalStrategyUsed: "SERP_SITE_ORGANIC",
});
assert(failFewerNoTier.outcome === "fail", "fail fewer results without higher tier");
assert(
  failFewerNoTier.failReason === "router_fewer_results_without_higher_tier_success",
  "fail reason fewer without tier"
);

assert(
  recommendSupplierPromotion({
    supplierId: "wittichen_hsv",
    passes: 5,
    fails: 0,
    totalQueries: 5,
    primaryStrategySuccessCount: 2,
    chainExhaustedWithLegacySuccessCount: 0,
    shadowMatchStatus: "EXPECTED_FUTURE",
  }) === "PROMOTE",
  "wittichen promote when 5/5 with primary wins"
);

assert(
  recommendSupplierPromotion({
    supplierId: "abc_supply_hsv",
    passes: 5,
    fails: 0,
    totalQueries: 5,
    primaryStrategySuccessCount: 3,
    chainExhaustedWithLegacySuccessCount: 0,
    shadowMatchStatus: "EXPECTED_FUTURE",
  }) === "HOLD",
  "abc hold despite parity (defer auto-enable)"
);

assert(
  recommendSupplierPromotion({
    supplierId: "johnstone_hsv",
    passes: 2,
    fails: 3,
    totalQueries: 5,
    primaryStrategySuccessCount: 1,
    chainExhaustedWithLegacySuccessCount: 0,
    shadowMatchStatus: "EXACT_MATCH",
  }) === "INVESTIGATE",
  "investigate when fewer than 3 passes"
);

assert(
  recommendSupplierPromotion({
    supplierId: "gulfeagle_hsv",
    passes: 4,
    fails: 1,
    totalQueries: 5,
    primaryStrategySuccessCount: 0,
    chainExhaustedWithLegacySuccessCount: 0,
    shadowMatchStatus: "EXPECTED_FUTURE",
  }) === "HOLD",
  "hold when parity count but no primary strategy win"
);

const sampleCells: ParityCellRecord[] = [
  {
    supplierId: "wittichen_hsv",
    query: "furnace",
    primaryStrategy: "SCHEMA_OR_SITEMAP",
    resultCountLegacy: 3,
    latencyMsLegacy: 1000,
    resultCountRouter: 4,
    latencyMsRouter: 800,
    executionPath: "router",
    finalStrategyUsed: "SCHEMA_OR_SITEMAP",
    fallbackDepth: 0,
    chainExhausted: false,
    pagesBlocked: 0,
    outcome: "pass",
    passReason: "router_count_gte_legacy",
  },
  {
    supplierId: "wittichen_hsv",
    query: "condenser",
    primaryStrategy: "SCHEMA_OR_SITEMAP",
    resultCountLegacy: 2,
    latencyMsLegacy: 1200,
    resultCountRouter: 0,
    latencyMsRouter: 900,
    executionPath: "legacy_fallback",
    chainExhausted: true,
    pagesBlocked: 1,
    antiBotCategory: "CLOUDFLARE_CHALLENGE",
    blockedUrlClass: "product",
    outcome: "fail",
    failReason: "chain_exhausted_zero_results_while_legacy_had_results",
  },
];

const csv = buildParityCsvRows(sampleCells);
assert(csv.includes("supplierId,query,outcome"), "csv header present");
assert(csv.includes("wittichen_hsv"), "csv includes supplier row");

const reportSummary = buildParityReportSummary(sampleCells);
assert(reportSummary.totalCells === 2, "summary totalCells");
assert(reportSummary.passCount === 1, "summary passCount");
assert(reportSummary.failCount === 1, "summary failCount");

const jsonReport = JSON.stringify({
  phase: "6B.2",
  summary: reportSummary,
  supplierSummaries: buildSupplierSummaries(sampleCells, {
    wittichen_hsv: "EXPECTED_FUTURE",
  }),
  cells: sampleCells,
});
assert(jsonReport.includes('"phase":"6B.2"'), "json report serializes");
assert(jsonReport.includes("wittichen_hsv"), "json report includes cells");

const supplierSummaries = buildSupplierSummaries(sampleCells, {
  wittichen_hsv: "EXPECTED_FUTURE",
});
assert(supplierSummaries.length === 1, "one supplier summary");
assert(supplierSummaries[0].passes === 1, "supplier passes");
assert(supplierSummaries[0].fails === 1, "supplier fails");

console.log("\nAll validatePhase6bProvenCohort tests passed.\n");
