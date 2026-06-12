/**
 * Phase 8B — cross-path parity analysis (read-only, no routing changes).
 *
 *   npm run fingerprint:phase8b-parity
 *   npm run fingerprint:phase8b-parity -- --json
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findSupplierSearchAdapter } from "../../src/lib/suppliers/registry";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import {
  buildCrossPathExtractionRecord,
  type CrossPathExtractionRecord,
} from "../../src/lib/suppliers/routing/crossPathExtractionObservability";
import {
  isApiPrewarmOrchestratorFirst,
  isStorefrontOrchestratorFirst,
} from "../../src/lib/suppliers/routing/promotedOrchestratorRouting";
import type { SupplierExtractionEntryPoint } from "../../src/lib/suppliers/routing/extractionTelemetry";
import type { SupplierExtractionObservedPath } from "../../src/lib/suppliers/routing/extractionTelemetry";
import {
  getPromotedSupplierIds,
  getRouterExecutionMode,
  getSupplierPromotionState,
  type SupplierPromotionState,
} from "../../src/lib/suppliers/routing/routerExecutionMode";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import { getPrisma } from "../../src/lib/db.server";
import { fetchSupplierSiteSearchForStorefront } from "../../src/lib/search/storefront/fetchSupplierSiteSearchForStorefront.server";
import { resolveStorefrontSiteSearchStrategy } from "../../src/lib/search/storefront/resolveStorefrontSiteSearchStrategy";
import { toProductSearchQuery } from "../../src/lib/search/productSearchQuery";
import {
  PROVEN_V1_COHORT,
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

const COHORT = PROVEN_V1_COHORT;

const QUERIES = [
  "tile",
  "flooring",
  "furnace",
  "hvac",
  "air filter",
  "shingles",
  "roofing",
] as const;

const ENTRY_POINTS: SupplierExtractionEntryPoint[] = [
  "search_stage2",
  "api_product_search",
  "prewarm",
  "storefront",
];

type ParsedTelemetry = {
  route?: SupplierExtractionRouteEvent;
  adapterBypass?: boolean;
};

type PathObservation = {
  executionPath: SupplierExtractionObservedPath;
  strategyUsed?: string;
  resultCount: number;
  adapterBypass: boolean;
  executionMode: ReturnType<typeof getRouterExecutionMode>;
  supplierPromotionState: SupplierPromotionState;
  entryPoint: SupplierExtractionEntryPoint;
  notes?: string;
};

type ParityVerdict = "PASS" | "WARNING" | "FAIL" | "N/A";

type ParityRow = {
  supplierId: string;
  query: string;
  applicable: boolean;
  stage2: PathObservation | null;
  api: PathObservation | null;
  prewarm: PathObservation | null;
  storefront: PathObservation | null;
  countsMatch: boolean;
  pathsMatch: boolean;
  overall: ParityVerdict;
  rationale: string;
};

const capturedLogs: unknown[] = [];

function captureConsole(): () => void {
  const prev = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === "string") {
      try {
        capturedLogs.push(JSON.parse(args[0]));
      } catch {
        /* not JSON telemetry */
      }
    }
    prev(...args);
  };
  return () => {
    console.info = prev;
  };
}

function parseTelemetrySince(since: number): ParsedTelemetry {
  const slice = capturedLogs.slice(since) as Record<string, unknown>[];
  let route: SupplierExtractionRouteEvent | undefined;
  let adapterBypass = false;

  for (const line of slice) {
    if (line.event === "supplier_extraction_route") {
      route = line as SupplierExtractionRouteEvent;
    }
    if (
      line.event === "supplier_extraction_observation" &&
      line.adapterBypass === true
    ) {
      adapterBypass = true;
    }
  }

  return { route, adapterBypass };
}

function strategyFamily(strategy?: string): string {
  if (!strategy) return "none";
  const s = strategy.toUpperCase();
  if (s.includes("PUBLIC_API") || s.includes("PLATFORM") || s === "JOHNSTONE" || s === "FLOOR_AND_DECOR" || s.includes("ALGOLIA") || s.includes("SLI")) {
    return "platform_api";
  }
  if (s.includes("SCHEMA") || s.includes("SITEMAP")) return "schema_sitemap";
  if (s.includes("HTML")) return "html_scrape";
  if (s.includes("PROFILE")) return "profile";
  if (s.includes("SERP") || s.includes("ORGANIC") || s.includes("WITTICHEN") || s.includes("ABC_SUPPLY") || s.includes("GENERIC")) {
    return "serp_organic";
  }
  if (s.includes("STOREFRONT:")) return s.replace("STOREFRONT:", "").toLowerCase();
  return s.toLowerCase();
}

async function runApiPath(
  supplierId: string,
  query: string,
  domain: string | null
): Promise<{ results: unknown[]; since: number }> {
  const since = capturedLogs.length;
  const adapter = findSupplierSearchAdapter(supplierId);
  const orchestratorFirst = isApiPrewarmOrchestratorFirst(supplierId);

  if (adapter && !orchestratorFirst) {
    const { logAdapterBypassObservation } = await import(
      "../../src/lib/suppliers/routing/extractionTelemetry"
    );
    logAdapterBypassObservation({
      supplierId,
      entryPoint: "api_product_search",
      query,
      strategyUsed: adapter.apiSource,
    });
    const results = (await adapter.search(query)).filter(
      (r) => r.supplierId === supplierId
    );
    return { results, since };
  }

  const results = await searchSupplierDiscoveryForSupplier(
    supplierId,
    query,
    domain,
    { entryPoint: "api_product_search" }
  );
  return { results, since };
}

async function runPrewarmPath(
  supplierId: string,
  query: string,
  domain: string | null
): Promise<{ results: unknown[]; since: number }> {
  const since = capturedLogs.length;
  const adapter = findSupplierSearchAdapter(supplierId);
  const orchestratorFirst = isApiPrewarmOrchestratorFirst(supplierId);

  if (adapter && !orchestratorFirst) {
    const { logAdapterBypassObservation } = await import(
      "../../src/lib/suppliers/routing/extractionTelemetry"
    );
    logAdapterBypassObservation({
      supplierId,
      entryPoint: "prewarm",
      query,
      strategyUsed: adapter.apiSource,
    });
    const results = (await adapter.search(query)).filter(
      (r) => (r as { supplierId?: string }).supplierId === supplierId
    );
    return { results, since };
  }

  const results = await searchSupplierDiscoveryForSupplier(
    supplierId,
    query,
    domain,
    { entryPoint: "prewarm" }
  );
  return { results, since };
}

async function runStage2Path(
  supplierId: string,
  query: string,
  domain: string | null
): Promise<{ results: unknown[]; since: number }> {
  const since = capturedLogs.length;
  const productQuery = toProductSearchQuery(query);
  const results = await searchSupplierDiscoveryForSupplier(
    supplierId,
    productQuery,
    domain,
    { entryPoint: "search_stage2" }
  );
  return { results, since };
}

async function runStorefrontPath(
  supplierId: string,
  query: string,
  domain: string | null,
  logLabel: string
): Promise<{ results: unknown[]; since: number; strategyKind: string }> {
  const since = capturedLogs.length;
  const productQuery = toProductSearchQuery(query);
  const orchestratorFirst =
    isStorefrontOrchestratorFirst(supplierId);
  const strategy = resolveStorefrontSiteSearchStrategy(
    supplierId,
    domain,
    logLabel
  );
  const structured = await fetchSupplierSiteSearchForStorefront(
    supplierId,
    productQuery,
    logLabel
  );
  return {
    results: structured.flat,
    since,
    strategyKind: orchestratorFirst ? "orchestrator" : strategy.kind,
  };
}

function observationFromTelemetry(
  entryPoint: SupplierExtractionEntryPoint,
  query: string,
  resultCount: number,
  telemetry: ParsedTelemetry,
  supplierId: string,
  extra?: { strategyUsed?: string; executionPath?: SupplierExtractionObservedPath; notes?: string }
): PathObservation {
  const executionMode = getRouterExecutionMode();
  const supplierPromotionState = getSupplierPromotionState(supplierId);

  if (telemetry.adapterBypass) {
    return {
      entryPoint,
      executionMode,
      supplierPromotionState,
      executionPath: "adapter_bypass",
      strategyUsed: extra?.strategyUsed ?? telemetry.route?.finalStrategyUsed,
      resultCount,
      adapterBypass: true,
      notes: extra?.notes,
    };
  }

  if (telemetry.route) {
    return {
      entryPoint,
      executionMode,
      supplierPromotionState:
        telemetry.route.supplierPromotionState ?? supplierPromotionState,
      executionPath: telemetry.route.executionPath as SupplierExtractionObservedPath,
      strategyUsed: telemetry.route.finalStrategyUsed,
      resultCount,
      adapterBypass: false,
      notes: extra?.notes,
    };
  }

  return {
    entryPoint,
    executionMode,
    supplierPromotionState,
    executionPath: extra?.executionPath ?? "unknown",
    strategyUsed: extra?.strategyUsed,
    resultCount,
    adapterBypass: false,
    notes: extra?.notes,
  };
}

function storefrontStrategyLabel(kind: string): string {
  return `STOREFRONT:${kind}`;
}

function classifyParity(row: Omit<ParityRow, "overall" | "rationale" | "countsMatch" | "pathsMatch">): Pick<
  ParityRow,
  "countsMatch" | "pathsMatch" | "overall" | "rationale"
> {
  const paths = [row.stage2, row.api, row.prewarm, row.storefront].filter(
    Boolean
  ) as PathObservation[];

  if (paths.length === 0) {
    return {
      countsMatch: true,
      pathsMatch: true,
      overall: "N/A",
      rationale: "No path data",
    };
  }

  const executionPaths = new Set(paths.map((p) => p.executionPath));
  const counts = paths.map((p) => p.resultCount);
  const countSet = new Set(counts);
  const families = new Set(
    paths.map((p) => strategyFamily(p.strategyUsed)).filter((f) => f !== "none")
  );

  const pathsMatch = executionPaths.size === 1;
  const countsMatch =
    countSet.size === 1 ||
    (Math.max(...counts) === 0 && Math.min(...counts) === 0);

  const anyEmpty = counts.some((c) => c === 0);
  const allEmpty = counts.every((c) => c === 0);
  const maxCount = Math.max(...counts);
  const positiveCounts = counts.filter((c) => c > 0);
  const minPositive =
    positiveCounts.length > 0 ? Math.min(...positiveCounts) : 0;
  const countRatio =
    minPositive > 0 ? maxCount / minPositive : maxCount > 0 ? Infinity : 1;

  if (allEmpty) {
    return {
      countsMatch: true,
      pathsMatch,
      overall: pathsMatch ? "PASS" : "WARNING",
      rationale: "All paths empty",
    };
  }

  if (anyEmpty && !allEmpty) {
    return {
      countsMatch: false,
      pathsMatch,
      overall: "FAIL",
      rationale: "Some paths empty, others return products",
    };
  }

  if (countRatio > 3 && !countsMatch) {
    return {
      countsMatch: false,
      pathsMatch,
      overall: "FAIL",
      rationale: `Result count divergence >3x (${counts.join(" vs ")})`,
    };
  }

  if (families.size > 1) {
    const samePlatform =
      families.size === 2 &&
      [...families].every((f) =>
        ["platform_api", "schema_sitemap", "serp_organic"].includes(f)
      );
    if (!samePlatform) {
      return {
        countsMatch,
        pathsMatch,
        overall: countsMatch ? "WARNING" : "FAIL",
        rationale: `Strategy families differ: ${[...families].join(", ")}`,
      };
    }
  }

  if (!pathsMatch) {
    return {
      countsMatch,
      pathsMatch: false,
      overall: countsMatch ? "WARNING" : "FAIL",
      rationale: `Execution paths differ: ${[...executionPaths].join(", ")}`,
    };
  }

  return {
    countsMatch,
    pathsMatch: true,
    overall: "PASS",
    rationale: "Consistent path and comparable results",
  };
}

function isQueryApplicable(supplierId: string, query: string): boolean {
  const tileQueries = new Set(["tile", "flooring"]);
  const hvacQueries = new Set(["furnace", "hvac", "air filter"]);
  const roofQueries = new Set(["shingles", "roofing"]);

  if (supplierId === "floor_decor_hsv") return tileQueries.has(query);
  if (supplierId === "johnstone_hsv") return hvacQueries.has(query);
  if (supplierId === "wittichen_hsv") return hvacQueries.has(query);
  if (supplierId === "abc_supply_hsv") return roofQueries.has(query);
  if (supplierId === "gulfeagle_hsv") return roofQueries.has(query);
  if (supplierId === "trane_supply_hsv") return hvacQueries.has(query);
  if (supplierId === "re_michel_hsv") return hvacQueries.has(query);
  return false;
}

async function analyzeCell(
  supplierId: string,
  query: string,
  domain: string | null,
  logLabel: string
): Promise<ParityRow> {
  if (!isQueryApplicable(supplierId, query)) {
    return {
      supplierId,
      query,
      applicable: false,
      stage2: null,
      api: null,
      prewarm: null,
      storefront: null,
      countsMatch: true,
      pathsMatch: true,
      overall: "N/A",
      rationale: "Query not applicable to supplier category",
    };
  }

  const restore = captureConsole();

  try {
    const stage2Run = await runStage2Path(supplierId, query, domain);
    const stage2Tel = parseTelemetrySince(stage2Run.since);
    const stage2 = observationFromTelemetry(
      "search_stage2",
      query,
      stage2Run.results.length,
      stage2Tel,
      supplierId
    );

    const orchestratorFirst = isApiPrewarmOrchestratorFirst(supplierId);
    const apiRun = await runApiPath(supplierId, query, domain);
    const apiTel = parseTelemetrySince(apiRun.since);
    const adapter = findSupplierSearchAdapter(supplierId);
    const api = observationFromTelemetry(
      "api_product_search",
      query,
      apiRun.results.length,
      apiTel,
      supplierId,
      apiTel.adapterBypass
        ? {
            strategyUsed: adapter?.apiSource,
            notes: "adapter-first API path",
          }
        : orchestratorFirst
          ? { notes: "Phase 8E.0 promoted orchestrator-first API path" }
          : undefined
    );

    const prewarmRun = await runPrewarmPath(supplierId, query, domain);
    const prewarmTel = parseTelemetrySince(prewarmRun.since);
    const prewarm = observationFromTelemetry(
      "prewarm",
      query,
      prewarmRun.results.length,
      prewarmTel,
      supplierId,
      prewarmTel.adapterBypass
        ? {
            strategyUsed: adapter?.apiSource,
            notes: "adapter-first prewarm path",
          }
        : orchestratorFirst
          ? { notes: "Phase 8E.0 promoted orchestrator-first prewarm path" }
          : undefined
    );

    const sfRun = await runStorefrontPath(supplierId, query, domain, logLabel);
    const sfTel = parseTelemetrySince(sfRun.since);
    const storefrontConverged =
      isStorefrontOrchestratorFirst(supplierId);
    const sfStrategy = storefrontStrategyLabel(sfRun.strategyKind);
    const storefront = observationFromTelemetry(
      "storefront",
      query,
      sfRun.results.length,
      sfTel,
      supplierId,
      storefrontConverged
        ? { notes: "Phase 8E.0 promoted orchestrator-first storefront path" }
        : {
            strategyUsed: sfStrategy,
            executionPath: sfTel.adapterBypass
              ? "adapter_bypass"
              : sfRun.strategyKind === "platform_catalog"
                ? "legacy"
                : sfRun.strategyKind === "site_organic" ||
                    sfRun.strategyKind === "generic_db"
                  ? "legacy"
                  : "unknown",
            notes: `storefront strategy kind=${sfRun.strategyKind}`,
          }
    );

    const base = {
      supplierId,
      query,
      applicable: true,
      stage2,
      api,
      prewarm,
      storefront,
    };
    const verdict = classifyParity(base);
    return { ...base, ...verdict };
  } finally {
    restore();
  }
}

function summarizeBypass(records: CrossPathExtractionRecord[]) {
  const bypass = records.filter((r) => r.executionPath === "adapter_bypass");
  const bySupplier = new Map<string, number>();
  const byEntry = new Map<string, number>();
  for (const r of bypass) {
    bySupplier.set(r.supplierId, (bySupplier.get(r.supplierId) ?? 0) + 1);
    byEntry.set(r.entryPoint, (byEntry.get(r.entryPoint) ?? 0) + 1);
  }
  return { total: bypass.length, bySupplier, byEntry, records: bypass };
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const prisma = getPrisma();
  const rows: ParityRow[] = [];
  const allRecords: CrossPathExtractionRecord[] = [];

  for (const supplierId of COHORT) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { domain: true, name: true },
    });
    if (!supplier) continue;

    for (const query of QUERIES) {
      const row = await analyzeCell(
        supplierId,
        query,
        supplier.domain,
        supplier.name
      );
      rows.push(row);

      for (const [key, obs] of [
        ["search_stage2", row.stage2],
        ["api_product_search", row.api],
        ["prewarm", row.prewarm],
        ["storefront", row.storefront],
      ] as const) {
        if (!obs) continue;
        allRecords.push(
          buildCrossPathExtractionRecord({
            supplierId,
            query,
            entryPoint: key,
            executionPath: obs.executionPath,
            strategyUsed: obs.strategyUsed,
            resultCount: obs.resultCount,
            executionMode: obs.executionMode,
          })
        );
      }
    }
  }

  const bypass = summarizeBypass(allRecords);
  const applicableRows = rows.filter((r) => r.applicable);
  const failCount = applicableRows.filter((r) => r.overall === "FAIL").length;
  const warnCount = applicableRows.filter((r) => r.overall === "WARNING").length;
  const passCount = applicableRows.filter((r) => r.overall === "PASS").length;

  const report = {
    generatedAt: new Date().toISOString(),
    executionMode: getRouterExecutionMode(),
    promotedSuppliers: [...getPromotedSupplierIds()],
    cohort: COHORT,
    queries: QUERIES,
    summary: { passCount, warnCount, failCount, naCount: rows.length - applicableRows.length },
    promotionStateSummary: Object.fromEntries(
      COHORT.map((supplierId) => [supplierId, getSupplierPromotionState(supplierId)])
    ),
    rows,
    bypassAnalysis: {
      totalBypassObservations: bypass.total,
      bySupplier: Object.fromEntries(bypass.bySupplier),
      byEntryPoint: Object.fromEntries(bypass.byEntry),
    },
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase8b-cross-path-parity-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== Phase 8B Cross-Path Parity Report ===\n");
  console.log(`Written: ${outPath}\n`);
  console.log(
    `Summary: PASS=${passCount} WARNING=${warnCount} FAIL=${failCount} N/A=${report.summary.naCount}\n`
  );

  console.log(
    "Supplier | Query | S2 Strategy | API Strategy | Pre Strategy | SF Strategy | Counts? | Paths? | Verdict"
  );
  console.log("-".repeat(120));
  for (const r of applicableRows) {
    console.log(
      [
        r.supplierId,
        r.query,
        r.stage2?.strategyUsed ?? "-",
        r.api?.strategyUsed ?? "-",
        r.prewarm?.strategyUsed ?? "-",
        r.storefront?.strategyUsed ?? "-",
        r.countsMatch ? "Y" : "N",
        r.pathsMatch ? "Y" : "N",
        r.overall,
      ].join(" | ")
    );
  }

  console.log("\n=== Adapter bypass frequency ===");
  console.log(JSON.stringify(report.bypassAnalysis, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
