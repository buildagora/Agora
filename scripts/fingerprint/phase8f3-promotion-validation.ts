/**
 * Phase 8F.3 — promotion validation for ppg_paint_hsv + ferguson_plumbing_hsv.
 *
 *   npm run fingerprint:phase8f3-promotion
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import {
  getSupplierPromotionState,
} from "../../src/lib/suppliers/routing/routerExecutionMode";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import {
  PHASE_8F3_PROMOTED,
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

const QUERIES: Record<(typeof PHASE_8F3_PROMOTED)[number], string> = {
  ppg_paint_hsv: "interior paint",
  ferguson_plumbing_hsv: "pvc pipe",
};

const EXPECTED_STRATEGY: Record<(typeof PHASE_8F3_PROMOTED)[number], string> = {
  ppg_paint_hsv: "PUBLIC_API",
  ferguson_plumbing_hsv: "SCHEMA_OR_SITEMAP",
};

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
    phase: "8F.3",
    promotedCount: ROUTER_PROMOTED_SUPPLIERS.length,
    suppliers: [],
  };

  console.log("\n=== Phase 8F.3 Promotion Validation ===\n");

  let pass = 0;
  let fail = 0;

  for (const supplierId of PHASE_8F3_PROMOTED) {
    const facts = await loadSupplierFingerprintFacts(supplierId);
    const domain = facts?.canonicalDomain ?? null;
    const query = QUERIES[supplierId];
    const expected = EXPECTED_STRATEGY[supplierId];
    const promotionState = getSupplierPromotionState(supplierId);
    const paths: Record<string, unknown>[] = [];

    for (const entryPoint of ENTRY_POINTS) {
      const since = capturedLogs.length;
      const results = await searchSupplierDiscoveryForSupplier(
        supplierId,
        query,
        domain,
        { entryPoint }
      );
      const route = parseRouteEvents(since).pop();
      const ok =
        promotionState === "promoted" &&
        route?.executionPath === "router" &&
        route?.finalStrategyUsed === expected &&
        route?.adapterBypass !== true &&
        results.length > 0;

      if (ok) pass += 1;
      else fail += 1;

      paths.push({
        entryPoint,
        resultCount: results.length,
        executionPath: route?.executionPath,
        finalStrategyUsed: route?.finalStrategyUsed,
        adapterBypass: route?.adapterBypass ?? false,
        promotionState: route?.supplierPromotionState,
        pass: ok,
      });
    }

    (report.suppliers as unknown[]).push({
      supplierId,
      domain,
      promotionState,
      expectedStrategy: expected,
      paths,
    });

    const allPass = paths.every((p) => p.pass);
    console.log(
      `${supplierId}: promotion=${promotionState} ${allPass ? "PASS" : "FAIL"} (${paths.filter((p) => p.pass).length}/4)`
    );
  }

  report.summary = { pass, fail, allPass: fail === 0 };
  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase8f3-promotion-validation-${ts}.json`);
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
