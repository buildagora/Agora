/**
 * Phase 9.5 — Wave 1 validation (category-aware queries + HTML allowlist).
 *
 *   npm run fingerprint:phase9.5-validation
 *
 * Low-cost: validates Wave 1 cohort only; uses cachedSerpFetch via router chain.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSerpCacheStats } from "../../src/lib/serpCache/server";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { pickPrimaryCategoryId } from "../../src/lib/suppliers/categoryTaxonomy";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import {
  HTML_SCRAPE_WAVE1_SUPPLIERS,
  isHtmlScrapeExecutionAllowed,
} from "../../src/lib/suppliers/routing/resolveHtmlScrapeExecution";
import { resolveSupplierProbeQuery } from "../../src/lib/suppliers/routing/resolveSupplierProbeQuery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import { ROUTER_PROMOTED_SUPPLIERS } from "./phase6bProvenCohortParity";

process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

/** Phase 9.4 Category A QUERY_MISMATCH cohort. */
const QUERY_MISMATCH_COHORT = [
  "absolute_glass",
  "adco_pipe_hsv",
  "capitol_materials_athens",
  "capitol_materials_madison",
  "discount_metal_hsv",
  "huntsville_fastener",
  "inline_electric_hsv",
  "mayer_electric_hsv",
  "mcneese_glass",
  "metaltek_hsv",
  "north_aluminum",
  "prosource_hsv",
  "robert_henry_tile_hsv",
  "southland_hsv",
  "sw_auto_finishes",
  "sw_commercial_meridian",
  "sw_madison_commercial",
  "sw_memorial_nw",
  "sw_memorial_sw",
  "sw_monroe",
  "sw_owens_cross",
  "sw_product_finishes",
  "tile_liquidators",
  "tile_stone_market_hsv",
  "tractor_supply_madison",
  "vulcan_materials_hsv",
  "wilson_lumber_hsv",
] as const;

const BASELINE = {
  phase: "9.2",
  routerWinners: 22,
  chainExhausted: 98,
  legacyFallback: 98,
  promotedCount: 120,
};

const capturedLogs: string[] = [];
const originalInfo = console.info.bind(console);
console.info = (...args: unknown[]) => {
  for (const arg of args) {
    if (typeof arg === "string") capturedLogs.push(arg);
  }
  originalInfo(...args);
};

function parseRouteEvent(since: number): SupplierExtractionRouteEvent | undefined {
  const events = capturedLogs
    .slice(since)
    .filter((line) => line.includes("supplier_extraction_route"))
    .map((line) => JSON.parse(line) as SupplierExtractionRouteEvent);
  return events[events.length - 1];
}

function isRouterWinner(route: SupplierExtractionRouteEvent | undefined, resultCount: number): boolean {
  return (
    resultCount > 0 &&
    route?.executionPath === "router" &&
    !route?.chainExhausted &&
    Boolean(route?.finalStrategyUsed)
  );
}

async function main() {
  const serpStatsStart = getSerpCacheStats();
  const prisma = getPrisma();

  const wave1Ids = [
    ...new Set([...QUERY_MISMATCH_COHORT, ...HTML_SCRAPE_WAVE1_SUPPLIERS]),
  ];

  const categoryBySupplier = new Map<string, string>();
  const rows = await prisma.supplier.findMany({
    where: { id: { in: wave1Ids } },
    select: {
      id: true,
      category: true,
      primaryCategoryId: true,
      categoryLinks: { select: { categoryId: true } },
    },
  });
  for (const row of rows) {
    categoryBySupplier.set(
      row.id,
      pickPrimaryCategoryId({
        supplierId: row.id,
        linkCategoryIds: row.categoryLinks.map((l) => l.categoryId),
        legacyCategory: row.category,
      })
    );
  }

  const htmlResults: Record<string, unknown>[] = [];
  const queryMismatchResults: Record<string, unknown>[] = [];
  let cohortRouterWinners = 0;
  let cohortChainExhausted = 0;
  let cohortLegacyFallback = 0;
  let suppliesQueryCount = 0;

  console.log("\n=== Phase 9.5 Wave 1 Validation ===\n");
  console.log(`Validating ${wave1Ids.length} Wave 1 suppliers...\n`);

  for (const supplierId of wave1Ids) {
    const facts = await loadSupplierFingerprintFacts(supplierId);
    const domain = facts?.canonicalDomain ?? null;
    const plan = facts
      ? resolveExtractionStrategy({
          supplierId,
          facts,
          canonicalDomain: domain,
        })
      : null;
    const primaryStrategy = plan?.primaryStrategy ?? "PROBABILISTIC_CATEGORY_PROFILE";
    const query = resolveSupplierProbeQuery({
      supplierId,
      primaryStrategy,
      primaryCategoryId: categoryBySupplier.get(supplierId) as never,
    });
    if (query === "supplies") suppliesQueryCount += 1;

    const since = capturedLogs.length;
    const results = domain
      ? await searchSupplierDiscoveryForSupplier(supplierId, query, domain, {
          entryPoint: "search_stage2",
        })
      : [];
    const route = parseRouteEvent(since);
    const winner = isRouterWinner(route, results.length);
    if (winner) cohortRouterWinners += 1;
    if (route?.chainExhausted) cohortChainExhausted += 1;
    if (route?.executionPath === "legacy_fallback") cohortLegacyFallback += 1;

    const htmlAttempt = route?.attemptedStrategies?.find(
      (a) => a.strategy === "HTML_SCRAPE"
    );
    const row = {
      supplierId,
      query,
      primaryStrategy,
      resultCount: results.length,
      routerWinner: winner,
      chainExhausted: route?.chainExhausted ?? true,
      executionPath: route?.executionPath ?? null,
      finalStrategyUsed: route?.finalStrategyUsed ?? null,
      htmlAllowlisted: isHtmlScrapeExecutionAllowed(supplierId),
      htmlAttemptStatus: htmlAttempt?.status ?? null,
      htmlAttemptReason: htmlAttempt?.reason ?? null,
      htmlResultCount: htmlAttempt?.resultCount ?? 0,
      notAllowlisted: htmlAttempt?.reason === "supplier_not_allowlisted",
    };

    if ((HTML_SCRAPE_WAVE1_SUPPLIERS as readonly string[]).includes(supplierId)) {
      htmlResults.push(row);
    }
    if ((QUERY_MISMATCH_COHORT as readonly string[]).includes(supplierId)) {
      queryMismatchResults.push(row);
    }
  }

  const serpStatsEnd = getSerpCacheStats();
  const serpDelta = {
    hits: serpStatsEnd.hits - serpStatsStart.hits,
    misses: serpStatsEnd.misses - serpStatsStart.misses,
    writes: serpStatsEnd.writes - serpStatsStart.writes,
  };

  const htmlAllowlistPass = htmlResults.every((r) => !(r as { notAllowlisted: boolean }).notAllowlisted);
  const htmlWinners = htmlResults.filter((r) => (r as { routerWinner: boolean }).routerWinner).length;
  const queryWinners = queryMismatchResults.filter(
    (r) => (r as { routerWinner: boolean }).routerWinner
  ).length;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.5",
    wave1Changes: [
      "resolveSupplierProbeQuery shared helper",
      "HTML_SCRAPE allowlist expanded to 11 suppliers",
    ],
    baseline: BASELINE,
    wave1Cohort: {
      totalValidated: wave1Ids.length,
      queryMismatchCount: QUERY_MISMATCH_COHORT.length,
      htmlAllowlistCount: HTML_SCRAPE_WAVE1_SUPPLIERS.length,
      cohortRouterWinners,
      cohortChainExhausted,
      cohortLegacyFallback,
      suppliesQueryCount,
    },
    task4_htmlAllowlistValidation: {
      allPassAllowlistCheck: htmlAllowlistPass,
      htmlRouterWinners: htmlWinners,
      suppliers: htmlResults,
    },
    task5_queryMismatchValidation: {
      routerWinners: queryWinners,
      suppliers: queryMismatchResults,
    },
    task6_impact: {
      baselineRouterWinners: BASELINE.routerWinners,
      wave1CohortRouterWinners: cohortRouterWinners,
      projectedTotalRouterWinners: BASELINE.routerWinners + cohortRouterWinners,
      note: "Projected total assumes Wave 1 cohort wins are net-new vs Phase 9.2 baseline on same suppliers",
      baselineChainExhausted: BASELINE.chainExhausted,
      wave1CohortStillExhausted: cohortChainExhausted,
    },
    task7_serpCreditUsage: {
      cacheHits: serpDelta.hits,
      cacheMisses: serpDelta.misses,
      cacheWrites: serpDelta.writes,
      estimatedSerpApiCalls: serpDelta.misses,
      note: "Each cache miss ≈ 1 SerpAPI credit when SERP strategies run",
    },
    remainingWave1Gaps: {
      imageGateStillBlocking: queryMismatchResults
        .filter((r) => !(r as { routerWinner: boolean }).routerWinner)
        .map((r) => (r as { supplierId: string }).supplierId),
      htmlStillEmpty: htmlResults
        .filter((r) => (r as { resultCount: number }).resultCount === 0)
        .map((r) => (r as { supplierId: string }).supplierId),
    },
    wave2Recommendation:
      "Address IMAGE_EXTRACTION_FAILURE cohort (~30 suppliers): improve og:image/page fetch without removing image requirement",
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.5-wave1-validation-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("HTML allowlist check:", htmlAllowlistPass ? "PASS" : "FAIL");
  console.log("HTML router winners:", `${htmlWinners}/${htmlResults.length}`);
  console.log("Query mismatch router winners:", `${queryWinners}/${queryMismatchResults.length}`);
  console.log("Wave 1 cohort router winners:", cohortRouterWinners);
  console.log("SERP cache:", serpDelta);
  console.log(`\nWrote ${outPath}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
