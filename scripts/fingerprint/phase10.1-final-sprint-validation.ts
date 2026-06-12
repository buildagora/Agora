/**
 * Phase 10.1 — Final extraction sprint validation.
 *
 *   npm run fingerprint:phase10.1-validation
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { getSerpCacheStats } from "../../src/lib/serpCache/server";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { pickPrimaryCategoryId } from "../../src/lib/suppliers/categoryTaxonomy";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
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
process.env.FINGERPRINT_ROUTER_PRODUCT_ENGINE_TIMEOUT_MS = "90000";

const ESC_COHORT = ["esc_supply_hsv"] as const;

const HOME_DEPOT_COHORT = [
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
] as const;

const SERP_URL_QUALITY_COHORT = [
  "absolute_glass",
  "associated_masonry_madison",
  "discount_metal_hsv",
  "pinnacle_surfaces",
  "us_brick_madison",
  "parker_industrial_hsv",
  "summertown_metals_tn",
  "southland_hsv",
  "metaltek_hsv",
  "north_aluminum",
  "ewing_hsv",
  "park_supply_hsv",
  "farrell_calhoun",
  "ready_mix_usa_hsv",
] as const;

const BASELINE = {
  phase: "9.9-post-wave2b",
  routerWinners: 68,
  chainExhausted: 52,
  targetRouterWinners: "76-80",
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

function isRouterWinner(
  route: SupplierExtractionRouteEvent | undefined,
  resultCount: number
): boolean {
  return (
    resultCount > 0 &&
    route?.executionPath === "router" &&
    !route?.chainExhausted &&
    Boolean(route?.finalStrategyUsed)
  );
}

function countImagelessRows(
  results: Array<{ imageUrl?: string | null }>
): number {
  return results.filter(
    (row) => !row.imageUrl || String(row.imageUrl).trim().length === 0
  ).length;
}

async function validateSupplier(
  supplierId: string,
  categoryBySupplier: Map<string, string>
) {
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

  const since = capturedLogs.length;
  const results = domain
    ? await searchSupplierDiscoveryForSupplier(supplierId, query, domain, {
        entryPoint: "search_stage2",
      })
    : [];
  const route = parseRouteEvent(since);
  const htmlAttempt = route?.attemptedStrategies?.find(
    (a) => a.strategy === "HTML_SCRAPE"
  );
  const productEngineAttempt = route?.attemptedStrategies?.find(
    (a) => a.strategy === "SERP_PRODUCT_ENGINE"
  );
  const serpAttempt = route?.attemptedStrategies?.find(
    (a) => a.strategy === "SERP_SITE_ORGANIC"
  );

  return {
    supplierId,
    query,
    primaryStrategy,
    resultCount: results.length,
    routerWinner: isRouterWinner(route, results.length),
    chainExhausted: route?.chainExhausted ?? true,
    executionPath: route?.executionPath ?? null,
    finalStrategyUsed: route?.finalStrategyUsed ?? null,
    imagelessRows: countImagelessRows(results),
    imageCoverage:
      results.length === 0
        ? "n/a"
        : countImagelessRows(results) === 0
          ? "100%"
          : `${Math.round(
              ((results.length - countImagelessRows(results)) / results.length) *
                100
            )}%`,
    htmlScrapeStatus: htmlAttempt?.status ?? null,
    htmlScrapeResultCount: htmlAttempt?.resultCount ?? 0,
    productEngineStatus: productEngineAttempt?.status ?? null,
    productEngineReason: productEngineAttempt?.reason ?? null,
    serpOrganicStatus: serpAttempt?.status ?? null,
  };
}

async function main() {
  const serpStatsStart = getSerpCacheStats();
  const prisma = getPrisma();
  const allIds = [
    ...new Set([
      ...ROUTER_PROMOTED_SUPPLIERS,
      ...ESC_COHORT,
      ...HOME_DEPOT_COHORT,
      ...SERP_URL_QUALITY_COHORT,
    ]),
  ];

  const categoryBySupplier = new Map<string, string>();
  const rows = await prisma.supplier.findMany({
    where: { id: { in: allIds } },
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

  console.log("\n=== Phase 10.1 Final Extraction Sprint Validation ===\n");

  const escResults = [];
  for (const supplierId of ESC_COHORT) {
    escResults.push(await validateSupplier(supplierId, categoryBySupplier));
  }

  const homeDepotResults = [];
  for (const supplierId of HOME_DEPOT_COHORT) {
    homeDepotResults.push(await validateSupplier(supplierId, categoryBySupplier));
  }

  const serpUrlResults = [];
  for (const supplierId of SERP_URL_QUALITY_COHORT) {
    serpUrlResults.push(await validateSupplier(supplierId, categoryBySupplier));
  }

  console.log("\n--- Full promoted cohort (120) ---\n");
  const fullCohortResults = [];
  for (const supplierId of ROUTER_PROMOTED_SUPPLIERS) {
    fullCohortResults.push(await validateSupplier(supplierId, categoryBySupplier));
  }

  const serpStatsEnd = getSerpCacheStats();
  const serpDelta = {
    hits: serpStatsEnd.hits - serpStatsStart.hits,
    misses: serpStatsEnd.misses - serpStatsStart.misses,
    writes: serpStatsEnd.writes - serpStatsStart.writes,
    estimatedCreditsConsumed: serpStatsEnd.misses - serpStatsStart.misses,
  };

  const fullWinners = fullCohortResults.filter((r) => r.routerWinner);
  const fullExhausted = fullCohortResults.filter((r) => r.chainExhausted);
  const imagelessTotal = fullCohortResults.reduce(
    (n, r) => n + r.imagelessRows,
    0
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "10.1",
    sprintChanges: [
      "Wave 2C: ESC listing-page HTML parser (.product-item cards with images)",
      "Wave 3B: SERP_PRODUCT_ENGINE 90s timeout + Home Depot in-flight dedupe",
      "Wave 3A: SERP organic URL quality scoring + top-3 page fetch attempts",
    ],
    baseline: BASELINE,
    task1_escSupply: {
      cohortSize: ESC_COHORT.length,
      routerWinners: escResults.filter((r) => r.routerWinner).length,
      suppliers: escResults,
    },
    task2_homeDepot: {
      cohortSize: HOME_DEPOT_COHORT.length,
      routerWinners: homeDepotResults.filter((r) => r.routerWinner).length,
      timeouts: homeDepotResults.filter(
        (r) => r.productEngineStatus === "timeout"
      ).length,
      serpProductEngineWinners: homeDepotResults.filter(
        (r) =>
          r.routerWinner && r.finalStrategyUsed === "SERP_PRODUCT_ENGINE"
      ).length,
      suppliers: homeDepotResults,
    },
    task3_serpUrlQuality: {
      cohortSize: SERP_URL_QUALITY_COHORT.length,
      routerWinners: serpUrlResults.filter((r) => r.routerWinner).length,
      suppliers: serpUrlResults,
    },
    task5_impact: {
      beforeRouterWinners: BASELINE.routerWinners,
      afterRouterWinners: fullWinners.length,
      delta: fullWinners.length - BASELINE.routerWinners,
      targetMet:
        fullWinners.length >= 76 && fullWinners.length <= 80
          ? "yes"
          : fullWinners.length >= 76
            ? "above_target"
            : "below_target",
      beforeChainExhausted: BASELINE.chainExhausted,
      afterChainExhausted: fullExhausted.length,
      liveCatalogCount: fullWinners.length,
      imagelessRowsEmitted: imagelessTotal,
      remainingExhausted: fullExhausted.map((r) => r.supplierId),
      remainingBlocked: fullCohortResults
        .filter((r) => !r.routerWinner && r.resultCount === 0)
        .map((r) => r.supplierId),
    },
    serpCreditUsage: serpDelta,
    recommendation:
      fullWinners.length >= 76
        ? "extraction_good_enough_shift_focus_to_ui_storefront_buyer_workflow"
        : fullWinners.length >= 72
          ? "extraction_mostly_sufficient_begin_ui_in_parallel"
          : "continue_targeted_extraction_before_full_ui_shift",
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase10.1-final-sprint-validation-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n--- Summary ---");
  console.log("ESC router winners:", report.task1_escSupply.routerWinners);
  console.log(
    "Home Depot router winners:",
    report.task2_homeDepot.routerWinners,
    "(timeouts:",
    report.task2_homeDepot.timeouts + ")"
  );
  console.log(
    "SERP URL cohort winners:",
    report.task3_serpUrlQuality.routerWinners,
    "/",
    SERP_URL_QUALITY_COHORT.length
  );
  console.log(
    "Full cohort router winners:",
    fullWinners.length,
    "(baseline:",
    BASELINE.routerWinners + ")"
  );
  console.log("Imageless rows emitted:", imagelessTotal);
  console.log("Serp cache hits/misses:", serpDelta.hits, "/", serpDelta.misses);
  console.log("Recommendation:", report.recommendation);
  console.log(`\nWrote ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
