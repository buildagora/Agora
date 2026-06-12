/**
 * Phase 9.1 — statistically representative promotion validation sample.
 *
 *   npm run fingerprint:phase9.1-validation
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import {
  getSupplierPromotionState,
} from "../../src/lib/suppliers/routing/routerExecutionMode";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import {
  DOMAIN_SUPPLIER_COHORT,
  ROUTER_PROMOTED_SUPPLIERS,
} from "./phase6bProvenCohortParity";

process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

/** One supplier per primary strategy + warning cohort coverage. */
const VALIDATION_SAMPLE = [
  { supplierId: "floor_decor_hsv", bucket: "PUBLIC_API", query: "tile" },
  { supplierId: "ppg_paint_hsv", bucket: "PUBLIC_API", query: "interior paint" },
  { supplierId: "johnstone_hsv", bucket: "PLATFORM_API", query: "filter" },
  { supplierId: "lennox_hsv", bucket: "PLATFORM_API", query: "furnace" },
  { supplierId: "ferguson_plumbing_hsv", bucket: "SCHEMA_OR_SITEMAP", query: "pvc pipe" },
  { supplierId: "wittichen_hsv", bucket: "SCHEMA_OR_SITEMAP", query: "hvac" },
  { supplierId: "grainger_hsv", bucket: "SCHEMA_OR_SITEMAP_WARN", query: "safety gloves" },
  { supplierId: "84_lumber_mad", bucket: "HTML_SCRAPE", query: "lumber" },
  { supplierId: "daltile_hsv", bucket: "HTML_SCRAPE_WARN", query: "tile" },
  { supplierId: "home_depot_hsv", bucket: "SERP_PRODUCT_ENGINE", query: "drill" },
  { supplierId: "lowes_hsv", bucket: "SERP_PRODUCT_ENGINE", query: "paint" },
  { supplierId: "lansing_hsv", bucket: "SERP_SITE_ORGANIC", query: "lumber" },
  { supplierId: "srs_hsv", bucket: "SERP_SITE_ORGANIC", query: "shingles" },
  { supplierId: "abc_supply_hsv", bucket: "WARN_DIRECT_OUTRANKS", query: "shingles" },
  { supplierId: "baker_hsv", bucket: "WARN_PLATFORM_BLOCKED", query: "filter" },
] as const;

const ENTRY_POINTS = [
  "search_stage2",
  "api_product_search",
  "prewarm",
  "storefront",
] as const;

const capturedLogs: string[] = [];
const originalInfo = console.info.bind(console);
console.info = (...args: unknown[]) => {
  for (const arg of args) {
    if (typeof arg === "string") capturedLogs.push(arg);
  }
  originalInfo(...args);
};

function parseRouteEvents(since: number): SupplierExtractionRouteEvent[] {
  return capturedLogs
    .slice(since)
    .filter((line) => line.includes("supplier_extraction_route"))
    .map((line) => JSON.parse(line) as SupplierExtractionRouteEvent);
}

async function main() {
  const prisma = getPrisma();
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    phase: "9.1",
    previousPromotedCount: 14,
    newPromotedCount: ROUTER_PROMOTED_SUPPLIERS.length,
    domainCohortCount: DOMAIN_SUPPLIER_COHORT.length,
    sampleSize: VALIDATION_SAMPLE.length,
    suppliers: [],
    telemetrySummary: {
      routerPath: 0,
      legacyFallback: 0,
      adapterBypass: 0,
      chainExhausted: 0,
      strategyCounts: {} as Record<string, number>,
    },
  };

  console.log("\n=== Phase 9.1 Validation Sample ===\n");
  console.log(
    `Promoted: ${report.previousPromotedCount} → ${report.newPromotedCount}\n`
  );

  let pass = 0;
  let fail = 0;

  for (const sample of VALIDATION_SAMPLE) {
    const facts = await loadSupplierFingerprintFacts(sample.supplierId);
    const domain = facts?.canonicalDomain ?? null;
    const plan = facts
      ? resolveExtractionStrategy({
          supplierId: sample.supplierId,
          facts,
          canonicalDomain: domain,
        })
      : null;
    const promotionState = getSupplierPromotionState(sample.supplierId);
    const paths: Record<string, unknown>[] = [];

    for (const entryPoint of ENTRY_POINTS) {
      const since = capturedLogs.length;
      const results = await searchSupplierDiscoveryForSupplier(
        sample.supplierId,
        sample.query,
        domain,
        { entryPoint }
      );
      const route = parseRouteEvents(since).pop();
      // Adoption pass: orchestrator attempted, no adapter bypass.
      // legacy_fallback after chain exhaustion is expected for some warning-tier suppliers.
      const ok =
        promotionState === "promoted" &&
        route?.routerExecutionAttempted === true &&
        route?.adapterBypass !== true;

      if (ok) pass += 1;
      else fail += 1;

      const summary = report.telemetrySummary as {
        routerPath: number;
        legacyFallback: number;
        adapterBypass: number;
        chainExhausted: number;
        strategyCounts: Record<string, number>;
      };
      if (route?.executionPath === "router") summary.routerPath += 1;
      if (route?.executionPath === "legacy_fallback") summary.legacyFallback += 1;
      if (route?.adapterBypass) summary.adapterBypass += 1;
      if (route?.chainExhausted) summary.chainExhausted += 1;
      const strat = route?.finalStrategyUsed ?? "(none)";
      summary.strategyCounts[strat] = (summary.strategyCounts[strat] ?? 0) + 1;

      paths.push({
        entryPoint,
        resultCount: results.length,
        executionPath: route?.executionPath,
        finalStrategyUsed: route?.finalStrategyUsed,
        adapterBypass: route?.adapterBypass ?? false,
        chainExhausted: route?.chainExhausted ?? false,
        promotionState: route?.supplierPromotionState,
        pass: ok,
      });
    }

    (report.suppliers as unknown[]).push({
      supplierId: sample.supplierId,
      bucket: sample.bucket,
      query: sample.query,
      primaryStrategy: plan?.primaryStrategy,
      promotionState,
      paths,
    });

    const allPass = paths.every((p) => p.pass);
    console.log(
      `${sample.supplierId} [${sample.bucket}]: ${allPass ? "PASS" : "FAIL"}`
    );
  }

  report.summary = { pass, fail, allPass: fail === 0 };
  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.1-validation-sample-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nCells: PASS=${pass} FAIL=${fail}`);
  console.log(`Written: ${outPath}\n`);

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
