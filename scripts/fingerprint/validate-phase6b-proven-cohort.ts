/**
 * Phase 6B.2 — proven-v1 batch parity validation (legacy vs router).
 *
 *   npx tsx scripts/fingerprint/validate-phase6b-proven-cohort.ts
 *   npx tsx scripts/fingerprint/validate-phase6b-proven-cohort.ts --supplier-id wittichen_hsv
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import type { LegacyStrategySnapshot } from "../../src/lib/suppliers/fingerprint/types";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import { resolveLegacyStrategy } from "../../src/lib/suppliers/routing/resolveLegacyStrategy";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import { shadowCompare } from "../../src/lib/suppliers/routing/shadowCompare";
import {
  buildParityCsvRows,
  buildParityReportSummary,
  buildSupplierSummaries,
  classifyParityCell,
  expandProvenV1Matrix,
  PROVEN_V1_COHORT,
  PROVEN_V1_DOMAIN_OVERRIDES,
  type ParityCellRecord,
  summarizeAntiBotAttempts,
} from "./phase6bProvenCohortParity";

const OUTPUT_DIR = join(process.cwd(), "scripts/output/fingerprint");
const ROUTER_TIMEOUT_MS = 45_000;

type CliArgs = {
  supplierId?: string;
  query?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--supplier-id") args.supplierId = argv[++i];
    else if (token === "--query") args.query = argv[++i];
  }
  return args;
}

function applyRouterEnv(mode: "legacy" | "router"): void {
  if (mode === "legacy") {
    process.env.FINGERPRINT_ROUTER_ENABLED = "false";
    process.env.FINGERPRINT_ROUTER_SHADOW = "false";
    delete process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST;
    return;
  }

  process.env.FINGERPRINT_ROUTER_ENABLED = "true";
  process.env.FINGERPRINT_ROUTER_SHADOW = "true";
  process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = PROVEN_V1_COHORT.join(",");
  process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = String(ROUTER_TIMEOUT_MS);
}

function createRouteEventCapture(): {
  events: SupplierExtractionRouteEvent[];
  restore: () => void;
} {
  const events: SupplierExtractionRouteEvent[] = [];
  const originalInfo = console.info.bind(console);
  console.info = (...logArgs: unknown[]) => {
    for (const arg of logArgs) {
      if (typeof arg === "string" && arg.includes("supplier_extraction_route")) {
        try {
          events.push(JSON.parse(arg) as SupplierExtractionRouteEvent);
        } catch {
          /* ignore non-json logs */
        }
      }
    }
    originalInfo(...logArgs);
  };
  return {
    events,
    restore: () => {
      console.info = originalInfo;
    },
  };
}

async function runDiscoveryPass(input: {
  supplierId: string;
  query: string;
  dbDomain: string | null;
  mode: "legacy" | "router";
}): Promise<{
  resultCount: number;
  latencyMs: number;
  routeEvent?: SupplierExtractionRouteEvent;
}> {
  applyRouterEnv(input.mode);
  const capture = createRouteEventCapture();
  const start = Date.now();

  try {
    const results = await searchSupplierDiscoveryForSupplier(
      input.supplierId,
      input.query,
      input.dbDomain
    );
    const latencyMs = Date.now() - start;
    const routeEvent = capture.events[capture.events.length - 1];
    return {
      resultCount: results.length,
      latencyMs:
        input.mode === "router" && routeEvent?.latencyMsRouter != null
          ? routeEvent.latencyMsRouter
          : latencyMs,
      routeEvent,
    };
  } finally {
    capture.restore();
  }
}

async function loadShadowStatusBySupplier(): Promise<Record<string, string>> {
  const prisma = getPrisma();
  const rows = await prisma.supplierFingerprint.findMany({
    where: { supplierId: { in: [...PROVEN_V1_COHORT] } },
    select: {
      supplierId: true,
      canonicalDomain: true,
      detectedPlatform: true,
      platformAccessStatus: true,
      publicApiAccessStatus: true,
      hasSchemaMarkup: true,
      hasSitemap: true,
      renderingType: true,
      antiBotRisk: true,
      allowSerpFallback: true,
      legacySnapshot: true,
    },
  });

  const shadowBySupplier: Record<string, string> = {};
  for (const row of rows) {
    const legacySnapshot = (row.legacySnapshot ?? {
      matchKind: "generic_domain",
    }) as LegacyStrategySnapshot;
    const facts = {
      supplierId: row.supplierId,
      canonicalDomain: row.canonicalDomain,
      detectedPlatform: row.detectedPlatform,
      platformDetectionConfidence: null,
      platformDetectionSource: null,
      platformAccessStatus: row.platformAccessStatus,
      platformBindingId: null,
      platformBindingValid: false,
      hasPublicApi: null,
      publicApiAccessStatus: row.publicApiAccessStatus,
      publicApiEndpoint: null,
      hasSchemaMarkup: row.hasSchemaMarkup,
      hasSitemap: row.hasSitemap,
      sitemapUrls: null,
      renderingType: row.renderingType,
      isSPA: null,
      antiBotRisk: row.antiBotRisk,
      demandPriority: "MEDIUM" as const,
      demandScore: null,
      allowSerpFallback: row.allowSerpFallback,
      fingerprintStatus: "SUCCESS" as const,
      lastFingerprintedAt: null,
      legacySnapshot,
      notes: null,
    };
    const legacy = resolveLegacyStrategy({
      supplierId: row.supplierId,
      canonicalDomain: row.canonicalDomain,
      legacySnapshot,
    });
    const router = resolveExtractionStrategy({
      supplierId: row.supplierId,
      canonicalDomain: row.canonicalDomain,
      facts,
      legacySnapshot,
    });
    shadowBySupplier[row.supplierId] = shadowCompare({
      legacy,
      router,
      facts,
    }).matchStatus;
  }
  return shadowBySupplier;
}

async function main() {
  const args = parseArgs(process.argv);
  const matrix = expandProvenV1Matrix(args);

  if (matrix.length === 0) {
    console.error("No cells matched --supplier-id / --query filters.");
    process.exit(1);
  }

  console.log(
    `[phase:6b.2] proven-v1 parity cells=${matrix.length} suppliers=${PROVEN_V1_COHORT.length}`
  );

  const prisma = getPrisma();
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: [...PROVEN_V1_COHORT] } },
    select: { id: true, domain: true },
  });
  const domainBySupplier = new Map(
    suppliers.map((row) => [row.id, row.domain ?? null])
  );

  const shadowBySupplier = await loadShadowStatusBySupplier();
  const cells: ParityCellRecord[] = [];

  for (const { supplierId, query } of matrix) {
    const dbDomain =
      PROVEN_V1_DOMAIN_OVERRIDES[supplierId] ??
      domainBySupplier.get(supplierId) ??
      null;

    console.log(`\n[cell] ${supplierId} query="${query}" domain=${dbDomain ?? "(none)"}`);

    const legacyPass = await runDiscoveryPass({
      supplierId,
      query,
      dbDomain,
      mode: "legacy",
    });

    const routerPass = await runDiscoveryPass({
      supplierId,
      query,
      dbDomain,
      mode: "router",
    });

    const antiBot = summarizeAntiBotAttempts(routerPass.routeEvent?.attemptedStrategies);
    const primaryStrategy = routerPass.routeEvent?.primaryStrategy;

    const classification = classifyParityCell({
      resultCountLegacy: legacyPass.resultCount,
      resultCountRouter: routerPass.resultCount,
      executionPath: routerPass.routeEvent?.executionPath,
      finalStrategyUsed: routerPass.routeEvent?.finalStrategyUsed,
      fallbackDepth: routerPass.routeEvent?.fallbackDepth,
      chainExhausted: routerPass.routeEvent?.chainExhausted,
      attemptedStrategies: routerPass.routeEvent?.attemptedStrategies,
      primaryStrategy,
    });

    const cell: ParityCellRecord = {
      supplierId,
      query,
      primaryStrategy,
      resultCountLegacy: legacyPass.resultCount,
      latencyMsLegacy: legacyPass.latencyMs,
      resultCountRouter: routerPass.resultCount,
      latencyMsRouter: routerPass.latencyMs,
      executionPath: routerPass.routeEvent?.executionPath,
      finalStrategyUsed: routerPass.routeEvent?.finalStrategyUsed,
      fallbackDepth: routerPass.routeEvent?.fallbackDepth,
      chainExhausted: routerPass.routeEvent?.chainExhausted,
      attemptedStrategies: routerPass.routeEvent?.attemptedStrategies,
      pagesBlocked: antiBot.pagesBlocked,
      antiBotCategory: antiBot.antiBotCategory,
      blockedUrlClass: antiBot.blockedUrlClass,
      outcome: classification.outcome,
      passReason: classification.passReason,
      failReason: classification.failReason,
    };

    cells.push(cell);
    console.log(
      JSON.stringify({
        outcome: cell.outcome,
        passReason: cell.passReason,
        failReason: cell.failReason,
        resultCountLegacy: cell.resultCountLegacy,
        resultCountRouter: cell.resultCountRouter,
        executionPath: cell.executionPath,
        finalStrategyUsed: cell.finalStrategyUsed,
        chainExhausted: cell.chainExhausted,
      })
    );
  }

  const summary = buildParityReportSummary(cells);
  const supplierSummaries = buildSupplierSummaries(cells, shadowBySupplier);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUTPUT_DIR, `phase6b-parity-${timestamp}.json`);
  const csvPath = join(OUTPUT_DIR, `phase6b-parity-${timestamp}.csv`);

  const report = {
    phase: "6B.2",
    generatedAt: new Date().toISOString(),
    cohort: PROVEN_V1_COHORT,
    args,
    summary,
    supplierSummaries,
    cells,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(csvPath, buildParityCsvRows(cells), "utf8");

  console.log("\n--- Summary ---");
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n--- Supplier summaries ---");
  for (const row of supplierSummaries) {
    console.log(
      JSON.stringify({
        supplierId: row.supplierId,
        passes: row.passes,
        fails: row.fails,
        avgLatencyLegacy: row.avgLatencyLegacy,
        avgLatencyRouter: row.avgLatencyRouter,
        mostCommonFinalStrategy: row.mostCommonFinalStrategy,
        promotionRecommendation: row.promotionRecommendation,
      })
    );
  }

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrisma();
    await prisma.$disconnect();
  });
