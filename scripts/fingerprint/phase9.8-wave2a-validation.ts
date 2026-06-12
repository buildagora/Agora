/**
 * Phase 9.8 — Wave 2A validation (product engine + URL classification).
 *
 *   npm run fingerprint:phase9.8-validation
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { getSerpCacheStats } from "../../src/lib/serpCache/server";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { pickPrimaryCategoryId } from "../../src/lib/suppliers/categoryTaxonomy";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import { resolveSupplierProbeQuery } from "../../src/lib/suppliers/routing/resolveSupplierProbeQuery";
import { classifyUrl } from "../../src/lib/search/classification/classifyUrl";
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

const PRODUCT_ENGINE_COHORT = [
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
  "lowes_south_hsv",
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
] as const;

const URL_CLASSIFICATION_COHORT = [
  "absolute_glass",
  "associated_masonry_madison",
  "discount_metal_hsv",
  "electronic_fasteners_hsv",
  "ewing_hsv",
  "general_shale_hsv",
  "henley_supply",
  "imperial_fence_supply",
  "industrial_contractor_supply",
  "inline_electric_hsv",
  "lw_supply_hsv",
  "metaltek_hsv",
  "national_coatings",
  "north_aluminum",
  "parker_industrial_hsv",
  "pinnacle_surfaces",
  "service_steel_hsv",
  "southland_hsv",
  "spectra_gutter",
  "srm_concrete_hsv",
  "summertown_metals_tn",
  "triton_stone_hsv",
  "us_brick_madison",
] as const;

const BASELINE = {
  phase: "9.5-post-wave1",
  routerWinners: 49,
  chainExhausted: 71,
  legacyFallback: 71,
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
  const productEngineAttempt = route?.attemptedStrategies?.find(
    (a) => a.strategy === "SERP_PRODUCT_ENGINE"
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
    adapterBypass: route?.adapterBypass ?? null,
    imagelessRows: countImagelessRows(results),
    productEngineAttemptStatus: productEngineAttempt?.status ?? null,
    productEngineAttemptReason: productEngineAttempt?.reason ?? null,
    productEngineResultCount: productEngineAttempt?.resultCount ?? 0,
  };
}

async function main() {
  const serpStatsStart = getSerpCacheStats();
  const prisma = getPrisma();
  const wave2Ids = [
    ...new Set([...PRODUCT_ENGINE_COHORT, ...URL_CLASSIFICATION_COHORT]),
  ];

  const categoryBySupplier = new Map<string, string>();
  const rows = await prisma.supplier.findMany({
    where: { id: { in: wave2Ids } },
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

  console.log("\n=== Phase 9.8 Wave 2A Validation ===\n");

  const productEngineResults = [];
  for (const supplierId of PRODUCT_ENGINE_COHORT) {
    productEngineResults.push(await validateSupplier(supplierId, categoryBySupplier));
  }

  const urlClassificationResults = [];
  for (const supplierId of URL_CLASSIFICATION_COHORT) {
    urlClassificationResults.push(await validateSupplier(supplierId, categoryBySupplier));
  }

  const phase96Path = join(
    process.cwd(),
    "scripts/output/fingerprint/phase9.6-wave2-strategy-2026-06-10T14-54-05-629Z.json"
  );
  const phase96 = JSON.parse(readFileSync(phase96Path, "utf8")) as {
    task1_imageFailureInventory: Array<{
      supplierId: string;
      urlDiagnostics: Array<{ url: string; failureStage: string }>;
    }>;
  };

  const classificationReplay: Array<{
    url: string;
    before: "excluded";
    after: string;
    accepted: boolean;
  }> = [];

  for (const supplier of phase96.task1_imageFailureInventory) {
    if (
      !(URL_CLASSIFICATION_COHORT as readonly string[]).includes(supplier.supplierId)
    ) {
      continue;
    }
    for (const diag of supplier.urlDiagnostics) {
      if (diag.failureStage !== "url_excluded_by_classification") continue;
      const after = classifyUrl(diag.url);
      const accepted =
        after !== "UNKNOWN" &&
        after !== "BLOG_PAGE" &&
        after !== "DOCUMENTATION_PAGE";
      classificationReplay.push({
        url: diag.url,
        before: "excluded",
        after,
        accepted,
      });
    }
  }

  const serpStatsEnd = getSerpCacheStats();
  const serpDelta = {
    hits: serpStatsEnd.hits - serpStatsStart.hits,
    misses: serpStatsEnd.misses - serpStatsStart.misses,
    writes: serpStatsEnd.writes - serpStatsStart.writes,
  };

  const productEngineWinners = productEngineResults.filter((r) => r.routerWinner).length;
  const productEngineUnsupported = productEngineResults.filter(
    (r) => r.productEngineAttemptReason === "strategy_serp_product_engine"
  ).length;
  const urlClassificationWinners = urlClassificationResults.filter(
    (r) => r.routerWinner
  ).length;
  const cohortWinners = productEngineWinners + urlClassificationWinners;
  const cohortExhausted =
    productEngineResults.filter((r) => r.chainExhausted).length +
    urlClassificationResults.filter((r) => r.chainExhausted).length;
  const imagelessTotal =
    productEngineResults.reduce((n, r) => n + r.imagelessRows, 0) +
    urlClassificationResults.reduce((n, r) => n + r.imagelessRows, 0);

  const classificationAccepted = classificationReplay.filter((r) => r.accepted).length;
  const classificationStillExcluded = classificationReplay.length - classificationAccepted;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.8",
    wave2aChanges: [
      "SERP_PRODUCT_ENGINE executor wired to searchLowes/searchHomeDepot",
      "classifyUrl expanded for product/category listing paths",
    ],
    baseline: BASELINE,
    task4_productEngineValidation: {
      cohortSize: PRODUCT_ENGINE_COHORT.length,
      routerWinners: productEngineWinners,
      stillUnsupported: productEngineUnsupported,
      allHaveImages: imagelessTotal === 0,
      suppliers: productEngineResults,
    },
    task4_urlClassificationValidation: {
      cohortSize: URL_CLASSIFICATION_COHORT.length,
      routerWinners: urlClassificationWinners,
      offlineClassificationReplay: {
        urlsReplayed: classificationReplay.length,
        accepted: classificationAccepted,
        stillExcluded: classificationStillExcluded,
        samples: classificationReplay.slice(0, 20),
      },
      suppliers: urlClassificationResults,
    },
    task5_impact: {
      baselineRouterWinners: BASELINE.routerWinners,
      wave2aCohortRouterWinners: cohortWinners,
      projectedTotalRouterWinners: BASELINE.routerWinners + cohortWinners,
      baselineChainExhausted: BASELINE.chainExhausted,
      wave2aCohortStillExhausted: cohortExhausted,
      projectedChainExhausted: BASELINE.chainExhausted - cohortWinners,
      note: "Projected total assumes Wave 2A cohort wins are net-new vs post-Wave-1 baseline",
    },
    task6_serpCreditUsage: serpDelta,
    task7_qualityChecks: {
      imagelessRowsEmitted: imagelessTotal,
      productEngineNoLongerUnsupported:
        productEngineUnsupported === 0 &&
        productEngineResults.every(
          (r) => r.productEngineAttemptStatus !== "unsupported"
        ),
    },
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.8-wave2a-validation-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n--- Summary ---");
  console.log("Product engine winners:", productEngineWinners, "/", PRODUCT_ENGINE_COHORT.length);
  console.log("Product engine still unsupported:", productEngineUnsupported);
  console.log("URL classification winners:", urlClassificationWinners, "/", URL_CLASSIFICATION_COHORT.length);
  console.log("Offline classification replay accepted:", classificationAccepted, "/", classificationReplay.length);
  console.log("Projected router winners:", report.task5_impact.projectedTotalRouterWinners);
  console.log("Imageless rows emitted:", imagelessTotal);
  console.log(`\nWrote ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
