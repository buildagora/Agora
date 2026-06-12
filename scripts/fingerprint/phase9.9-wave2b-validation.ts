/**
 * Phase 9.9 — Wave 2B image hardening validation.
 *
 *   npm run fingerprint:phase9.9-validation
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
import {
  extractPageImageFromHtml,
  fetchSupplierPageHtml,
  PAGE_IMAGE_PIPELINE_ORDER,
} from "../../src/lib/search/extraction/pageImageExtraction";
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

const WAVE_2B_COHORT = [
  "absolute_glass",
  "associated_masonry_madison",
  "discount_metal_hsv",
  "ewing_hsv",
  "general_shale_hsv",
  "inline_electric_hsv",
  "metaltek_hsv",
  "north_aluminum",
  "parker_industrial_hsv",
  "pinnacle_surfaces",
  "southland_hsv",
  "summertown_metals_tn",
  "us_brick_madison",
] as const;

const BASELINE = {
  phase: "9.8-post-wave2a",
  routerWinners: 66,
  wave2bCohortWinnersBefore: 0,
  chainExhausted: 54,
};

const PHASE_96 = join(
  process.cwd(),
  "scripts/output/fingerprint/phase9.6-wave2-strategy-2026-06-10T14-54-05-629Z.json"
);
const PHASE_98 = join(
  process.cwd(),
  "scripts/output/fingerprint/phase9.8-wave2a-validation-2026-06-10T15-25-59-272Z.json"
);

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

async function main() {
  const serpStatsStart = getSerpCacheStats();
  const prisma = getPrisma();

  const phase96 = JSON.parse(readFileSync(PHASE_96, "utf8")) as {
    task1_imageFailureInventory: Array<{
      supplierId: string;
      urlDiagnostics: Array<{
        url: string;
        failureStage: string;
        resultType?: string;
      }>;
    }>;
  };

  let phase98WinnersBefore = 0;
  try {
    const phase98 = JSON.parse(readFileSync(PHASE_98, "utf8")) as {
      task4_urlClassificationValidation: {
        suppliers: Array<{ supplierId: string; routerWinner: boolean }>;
      };
    };
    phase98WinnersBefore = phase98.task4_urlClassificationValidation.suppliers.filter(
      (row) =>
        (WAVE_2B_COHORT as readonly string[]).includes(row.supplierId) &&
        row.routerWinner
    ).length;
  } catch {
    phase98WinnersBefore = 0;
  }

  const categoryBySupplier = new Map<string, string>();
  const rows = await prisma.supplier.findMany({
    where: { id: { in: [...WAVE_2B_COHORT] } },
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

  console.log("\n=== Phase 9.9 Wave 2B Validation ===\n");

  const supplierResults: Record<string, unknown>[] = [];
  let cohortRouterWinners = 0;
  let cohortChainExhausted = 0;
  let imagelessTotal = 0;

  for (const supplierId of WAVE_2B_COHORT) {
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
    const winner = isRouterWinner(route, results.length);
    if (winner) cohortRouterWinners += 1;
    if (route?.chainExhausted) cohortChainExhausted += 1;
    imagelessTotal += countImagelessRows(results);

    supplierResults.push({
      supplierId,
      query,
      resultCount: results.length,
      routerWinner: winner,
      chainExhausted: route?.chainExhausted ?? true,
      executionPath: route?.executionPath ?? null,
      finalStrategyUsed: route?.finalStrategyUsed ?? null,
      imagelessRows: countImagelessRows(results),
      resultsWithImages: results.filter((r) => r.imageUrl).length,
    });
  }

  const imageReplay: Record<string, unknown>[] = [];
  let replayExtracted = 0;
  let replayAttempted = 0;

  for (const supplier of phase96.task1_imageFailureInventory) {
    if (!(WAVE_2B_COHORT as readonly string[]).includes(supplier.supplierId)) continue;

    for (const diag of supplier.urlDiagnostics) {
      if (
        diag.failureStage !== "page_og_image_missing" &&
        diag.failureStage !== "json_ld_image_missing" &&
        diag.failureStage !== "all_stages_exhausted"
      ) {
        continue;
      }

      replayAttempted += 1;
      const fetched = await fetchSupplierPageHtml(diag.url);
      const extracted = fetched?.html
        ? extractPageImageFromHtml(fetched.html, diag.url)
        : null;
      if (extracted) replayExtracted += 1;

      imageReplay.push({
        supplierId: supplier.supplierId,
        url: diag.url,
        priorFailureStage: diag.failureStage,
        pageStatus: fetched?.status ?? null,
        extracted: Boolean(extracted),
        extractionSource: extracted?.source ?? null,
        imageUrl: extracted?.imageUrl ?? null,
      });
    }
  }

  const serpStatsEnd = getSerpCacheStats();
  const serpDelta = {
    hits: serpStatsEnd.hits - serpStatsStart.hits,
    misses: serpStatsEnd.misses - serpStatsStart.misses,
    writes: serpStatsEnd.writes - serpStatsStart.writes,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.9",
    wave2bChanges: [
      "Shared pageImageExtraction module (JSON-LD, og/twitter meta, DOM fallback)",
      "Alternate user-agent retry on blocked page fetches",
      "searchSupplierSite wired to resolvePageImageUrl",
    ],
    task1_imagePipelineAudit: {
      resolutionOrder: PAGE_IMAGE_PIPELINE_ORDER,
      priorFailureStagesFromPhase96: {
        url_excluded_by_classification: "addressed in Wave 2A",
        page_og_image_missing: "Wave 2B meta parser + entity decoding",
        json_ld_image_missing: "Wave 2B JSON-LD arrays/ImageObject support",
        all_stages_exhausted: "Wave 2B DOM fallback + fetch retry",
        page_fetch_blocked: "Wave 2B alternate user-agent retry",
      },
      note: "Remaining suppliers fail when page has no extractable supplier-owned image or fetch remains blocked",
    },
    baseline: {
      ...BASELINE,
      wave2bCohortWinnersBefore: phase98WinnersBefore,
    },
    task6_liveRouterValidation: {
      cohortSize: WAVE_2B_COHORT.length,
      routerWinners: cohortRouterWinners,
      chainExhausted: cohortChainExhausted,
      imagelessRowsEmitted: imagelessTotal,
      suppliers: supplierResults,
    },
    task6_offlineImageReplay: {
      urlsAttempted: replayAttempted,
      imagesExtracted: replayExtracted,
      extractionRate: replayAttempted
        ? `${Math.round((replayExtracted / replayAttempted) * 100)}%`
        : "0%",
      samples: imageReplay.slice(0, 25),
      allSamples: imageReplay,
    },
    task8_impact: {
      baselineRouterWinners: BASELINE.routerWinners,
      wave2bCohortWinnersBefore: phase98WinnersBefore,
      wave2bCohortWinnersAfter: cohortRouterWinners,
      cohortNetGain: cohortRouterWinners - phase98WinnersBefore,
      projectedTotalRouterWinners:
        BASELINE.routerWinners + (cohortRouterWinners - phase98WinnersBefore),
      baselineChainExhausted: BASELINE.chainExhausted,
      projectedChainExhausted: BASELINE.chainExhausted - (cohortRouterWinners - phase98WinnersBefore),
    },
    task7_qualityChecks: {
      imagelessRowsEmitted: imagelessTotal,
      allResultsHaveImages: imagelessTotal === 0,
    },
    serpCreditUsage: serpDelta,
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.9-wave2b-validation-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n--- Summary ---");
  console.log("Wave 2B cohort winners:", cohortRouterWinners, "/", WAVE_2B_COHORT.length);
  console.log("Prior Wave 2A winners in cohort:", phase98WinnersBefore);
  console.log("Net cohort gain:", cohortRouterWinners - phase98WinnersBefore);
  console.log("Projected total router winners:", report.task8_impact.projectedTotalRouterWinners);
  console.log("Offline image replay:", replayExtracted, "/", replayAttempted);
  console.log("Imageless rows emitted:", imagelessTotal);
  console.log(`\nWrote ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
