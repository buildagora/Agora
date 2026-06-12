/**
 * Phase 8E.2 — platform API cohort validation (read-only planning).
 * Does NOT update production promotion registry.
 *
 *   npx tsx scripts/fingerprint/phase8e2-platform-cohort-validation.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executeSupplierSearch } from "../../src/lib/search/executeSupplierSearch";
import { toProductSearchQuery } from "../../src/lib/search/productSearchQuery";
import { fetchSupplierSiteSearchForStorefront } from "../../src/lib/search/storefront/fetchSupplierSiteSearchForStorefront.server";
import { resolveStorefrontSiteSearchStrategy } from "../../src/lib/search/storefront/resolveStorefrontSiteSearchStrategy";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { executePlatformCatalogSearch } from "../../src/lib/suppliers/executePlatformCatalogSearch";
import { findSupplierSearchAdapter } from "../../src/lib/suppliers/registry";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import {
  isPlatformApiExecutionAllowed,
  isPublicApiExecutionAllowed,
  resolvePlatformCatalogExecution,
} from "../../src/lib/suppliers/routing/resolvePlatformCatalogExecution";
import {
  isApiPrewarmOrchestratorFirst,
  isStorefrontOrchestratorFirst,
} from "../../src/lib/suppliers/routing/promotedOrchestratorRouting";
import { resolveLegacyStrategy } from "../../src/lib/suppliers/routing/resolveLegacyStrategy";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import {
  getRouterExecutionMode,
  getSupplierPromotionState,
} from "../../src/lib/suppliers/routing/routerExecutionMode";
import {
  PLATFORM_API_COHORT,
  PROVEN_V1_COHORT,
  ROUTER_PROMOTED_SUPPLIERS,
} from "./phase6bProvenCohortParity";

const PLATFORM_COHORT = PLATFORM_API_COHORT;

const QUERY_MATRIX: Record<(typeof PLATFORM_COHORT)[number], readonly string[]> = {
  lennox_hsv: ["furnace", "hvac", "air filter"],
  siteone_hsv: ["irrigation", "landscape fabric", "drainage"],
  siteone_north_hsv: ["irrigation", "mulch", "drainage"],
  ll_flooring_hsv: ["tile", "flooring", "vinyl plank"],
  cmn90dbjr000404ldzhcsquav: ["shingles", "fasteners", "lumber"],
};

const SEARCH_QUERIES = [
  "furnace",
  "hvac",
  "air filter",
  "irrigation",
  "landscape fabric",
  "drainage",
  "tile",
  "flooring",
  "vinyl plank",
  "lumber",
  "fasteners",
  "concrete",
  "shingles",
] as const;

const LOCATION = { label: "Huntsville, AL", lat: 34.7304, lng: -86.5861 };

// Simulate promotion for safe-to-promote testing (does not persist).
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  ROUTER_PROMOTED_SUPPLIERS.join(",");
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

type ReadinessClass = "READY" | "NEEDS_WORK" | "BLOCKED";
type ParityVerdict = "PASS" | "WARNING" | "FAIL";

type ParsedTelemetry = {
  route?: SupplierExtractionRouteEvent;
  adapterBypass?: boolean;
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

function executorTypeFromFacts(
  supplierId: string,
  facts: Awaited<ReturnType<typeof loadSupplierFingerprintFacts>>
): string {
  if (!facts) return "unknown";
  const legacy = resolveLegacyStrategy({
    supplierId,
    canonicalDomain: facts.canonicalDomain,
    legacySnapshot: facts.legacySnapshot,
  });
  return legacy.strategy;
}

function classifyReadiness(input: {
  domainPresent: boolean;
  coordinatesPresent: boolean;
  fingerprintStatus: string | null;
  platformAccessStatus: string | null;
  executorType: string;
  platformAccessTest: { ok: boolean; resultCount: number; error?: string };
  parityFails: number;
  parityWarnings: number;
  adapterBypass: number;
}): ReadinessClass {
  if (!input.domainPresent || !input.coordinatesPresent) return "BLOCKED";
  if (input.fingerprintStatus !== "SUCCESS") return "BLOCKED";
  if (
    input.platformAccessStatus === "BLOCKED" ||
    input.platformAccessStatus === "BINDING_INCOMPLETE" ||
    input.platformAccessStatus === "REQUIRES_AUTH" ||
    input.platformAccessStatus === "REQUIRES_CONTRACT"
  ) {
    return "BLOCKED";
  }
  if (!input.platformAccessTest.ok) return "BLOCKED";
  if (input.adapterBypass > 0) return "BLOCKED";
  if (input.parityFails > 0) return "NEEDS_WORK";
  if (input.parityWarnings > 0 || input.platformAccessTest.resultCount === 0) {
    return "NEEDS_WORK";
  }
  return "READY";
}

function classifyParityCell(paths: {
  executionPath: string;
  strategyUsed?: string;
  resultCount: number;
  adapterBypass: boolean;
}[]): { verdict: ParityVerdict; rationale: string } {
  if (paths.some((p) => p.adapterBypass)) {
    return { verdict: "FAIL", rationale: "adapter_bypass observed" };
  }
  const pathSet = new Set(paths.map((p) => p.executionPath));
  const counts = paths.map((p) => p.resultCount);
  const strategies = new Set(
    paths.map((p) => p.strategyUsed).filter(Boolean) as string[]
  );
  const platformStrategies = [...strategies].filter(
    (s) => s === "PLATFORM_API" || s === "PUBLIC_API"
  );

  if (pathSet.size > 1) {
    const allRouterOrFallback = [...pathSet].every(
      (p) => p === "router" || p === "legacy_fallback"
    );
    if (!allRouterOrFallback) {
      return {
        verdict: "FAIL",
        rationale: `execution paths differ: ${[...pathSet].join(", ")}`,
      };
    }
  }

  const anyResults = counts.some((c) => c > 0);
  const allEmpty = counts.every((c) => c === 0);
  if (allEmpty) {
    return { verdict: "WARNING", rationale: "all paths empty" };
  }
  if (counts.some((c) => c === 0) && anyResults) {
    return {
      verdict: "FAIL",
      rationale: "some paths empty while others return products",
    };
  }
  if (platformStrategies.length === 0 && anyResults) {
    return {
      verdict: "WARNING",
      rationale: `results without PLATFORM_API/PUBLIC_API strategy: ${[...strategies].join(", ")}`,
    };
  }
  if (!pathSet.has("router") && !allEmpty) {
    return { verdict: "WARNING", rationale: "no router path with results" };
  }
  return { verdict: "PASS", rationale: "consistent platform routing" };
}

async function runPath(
  entryPoint: "search_stage2" | "api_product_search" | "prewarm" | "storefront",
  supplierId: string,
  query: string,
  domain: string | null,
  logLabel: string
): Promise<{ resultCount: number; since: number }> {
  const since = capturedLogs.length;
  const productQuery = toProductSearchQuery(query);

  if (entryPoint === "storefront") {
    const structured = await fetchSupplierSiteSearchForStorefront(
      supplierId,
      productQuery,
      logLabel
    );
    return { resultCount: structured.flat.length, since };
  }

  if (entryPoint === "api_product_search" || entryPoint === "prewarm") {
    const adapter = findSupplierSearchAdapter(supplierId);
    const orchestratorFirst = isApiPrewarmOrchestratorFirst(supplierId);
    if (adapter && !orchestratorFirst) {
      const results = (await adapter.search(query)).filter(
        (r) => r.supplierId === supplierId
      );
      return { resultCount: results.length, since };
    }
    const results = await searchSupplierDiscoveryForSupplier(
      supplierId,
      query,
      domain,
      { entryPoint }
    );
    return { resultCount: results.length, since };
  }

  const results = await searchSupplierDiscoveryForSupplier(
    supplierId,
    productQuery,
    domain,
    { entryPoint: "search_stage2" }
  );
  return { resultCount: results.length, since };
}

async function main() {
  const prisma = getPrisma();
  const readinessRows = [];
  const parityRows = [];
  const platformAccessRows = [];
  const telemetrySamples = [];
  const searchRows = [];

  for (const supplierId of PLATFORM_COHORT) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { domain: true, name: true, latitude: true, longitude: true },
    });
    if (!supplier) {
      readinessRows.push({
        supplierId,
        classification: "BLOCKED" as const,
        reason: "supplier not in database",
      });
      continue;
    }

    const facts = await loadSupplierFingerprintFacts(supplierId);
    const domain =
      supplier.domain?.trim() || facts?.canonicalDomain?.trim() || null;
    const executorType = executorTypeFromFacts(supplierId, facts);
    const promotionState = getSupplierPromotionState(supplierId);

    const platformExec = resolvePlatformCatalogExecution(supplierId, domain);
    const probeQuery = QUERY_MATRIX[supplierId][0];
    let platformAccessTest: {
      ok: boolean;
      resultCount: number;
      error?: string;
      mode?: string;
    } = { ok: false, resultCount: 0, error: "no platform config" };

    if (facts && platformExec) {
      const allowed =
        executorType === "PUBLIC_API"
          ? isPublicApiExecutionAllowed(facts)
          : executorType === "PLATFORM_API"
            ? isPlatformApiExecutionAllowed(facts)
            : false;
      if (!allowed) {
        platformAccessTest = {
          ok: false,
          resultCount: 0,
          error: `execution not allowed (${facts.platformAccessStatus})`,
          mode: platformExec.config.mode,
        };
      } else {
        try {
          const results = await executePlatformCatalogSearch({
            supplierId,
            query: probeQuery,
            supplierIds: [supplierId],
            source: platformExec.source,
            logLabel: platformExec.logLabel,
            config: platformExec.config,
          });
          platformAccessTest = {
            ok: results.length > 0,
            resultCount: results.length,
            mode: platformExec.config.mode,
            error: results.length === 0 ? "zero results from platform API" : undefined,
          };
        } catch (err) {
          platformAccessTest = {
            ok: false,
            resultCount: 0,
            mode: platformExec.config.mode,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    platformAccessRows.push({
      supplierId,
      executorType,
      platformDetected: facts?.detectedPlatform ?? null,
      platformAccessStatus: facts?.platformAccessStatus ?? null,
      platformBindingValid: facts?.platformBindingValid ?? null,
      platformMode: platformExec?.config.mode ?? null,
      probeQuery,
      ...platformAccessTest,
    });

    let parityFails = 0;
    let parityWarnings = 0;
    let adapterBypassTotal = 0;

    for (const query of QUERY_MATRIX[supplierId]) {
      const restore = captureConsole();
      const pathObs: {
        entryPoint: string;
        executionPath: string;
        strategyUsed?: string;
        resultCount: number;
        adapterBypass: boolean;
        supplierPromotionState: string;
        executionMode: string;
        chainExhausted?: boolean;
        fallbackReason?: string;
      }[] = [];

      try {
        for (const entryPoint of [
          "search_stage2",
          "api_product_search",
          "prewarm",
          "storefront",
        ] as const) {
          const run = await runPath(
            entryPoint,
            supplierId,
            query,
            domain,
            supplier.name
          );
          const tel = parseTelemetrySince(run.since);
          const route = tel.route;
          pathObs.push({
            entryPoint,
            executionPath:
              (tel.adapterBypass
                ? "adapter_bypass"
                : route?.executionPath) ?? "unknown",
            strategyUsed: route?.finalStrategyUsed,
            resultCount: run.resultCount,
            adapterBypass: tel.adapterBypass ?? false,
            supplierPromotionState:
              route?.supplierPromotionState ?? promotionState,
            executionMode: route?.executionMode ?? getRouterExecutionMode(),
            chainExhausted: route?.chainExhausted,
            fallbackReason: route?.fallbackReason,
          });
          if (tel.adapterBypass) adapterBypassTotal += 1;
        }
      } finally {
        restore();
      }

      const cell = classifyParityCell(pathObs);
      if (cell.verdict === "FAIL") parityFails += 1;
      if (cell.verdict === "WARNING") parityWarnings += 1;

      parityRows.push({
        supplierId,
        query,
        paths: pathObs,
        verdict: cell.verdict,
        rationale: cell.rationale,
      });

      if (telemetrySamples.length < 15) {
        const sampleRoute = capturedLogs
          .slice(-20)
          .find(
            (l) =>
              typeof l === "object" &&
              l !== null &&
              (l as { event?: string }).event === "supplier_extraction_route" &&
              (l as { supplierId?: string }).supplierId === supplierId
          );
        if (sampleRoute) telemetrySamples.push(sampleRoute);
      }
    }

    const classification = classifyReadiness({
      domainPresent: Boolean(domain),
      coordinatesPresent:
        supplier.latitude != null && supplier.longitude != null,
      fingerprintStatus: facts?.fingerprintStatus ?? null,
      platformAccessStatus: facts?.platformAccessStatus ?? null,
      executorType,
      platformAccessTest,
      parityFails,
      parityWarnings,
      adapterBypass: adapterBypassTotal,
    });

    readinessRows.push({
      supplierId,
      executorType,
      platformDetected: facts?.detectedPlatform ?? null,
      domainPresent: Boolean(domain),
      coordinatesPresent:
        supplier.latitude != null && supplier.longitude != null,
      fingerprintStatus: facts?.fingerprintStatus ?? null,
      platformAccessStatus: facts?.platformAccessStatus ?? null,
      promotionState,
      classification,
      parityFails,
      parityWarnings,
      adapterBypass: adapterBypassTotal,
      hasAdapter: Boolean(findSupplierSearchAdapter(supplierId)),
      storefrontStrategy: domain
        ? resolveStorefrontSiteSearchStrategy(supplierId, domain, supplier.name)
            .kind
        : null,
    });
  }

  for (const query of SEARCH_QUERIES) {
    const pipeline = await executeSupplierSearch({
      query,
      location: LOCATION,
      radiusMiles: 25,
      maxResults: 20,
    });
    const ids = pipeline.cards.map((c) => c.supplierId);
    const platformHits = PLATFORM_COHORT.filter((id) => ids.includes(id));
    const ranks = Object.fromEntries(
      platformHits.map((id) => [id, ids.indexOf(id) + 1])
    );
    const liveEvidence = pipeline.cards
      .filter((c) => PLATFORM_COHORT.includes(c.supplierId as (typeof PLATFORM_COHORT)[number]))
      .map((c) => ({
        supplierId: c.supplierId,
        liveResultCount: c.liveResultCount,
        rank: ids.indexOf(c.supplierId) + 1,
      }));
    searchRows.push({ query, platformHits, ranks, liveEvidence });
  }

  const recommendations = readinessRows.map((row) => {
    if (typeof row === "object" && "classification" in row) {
      const r = row as (typeof readinessRows)[number] & {
        supplierId: string;
        classification: ReadinessClass;
        parityFails?: number;
        adapterBypass?: number;
        platformAccessStatus?: string | null;
      };
      let action: "PROMOTE" | "DEFER" | "BLOCK" = "DEFER";
      if (r.classification === "READY") action = "PROMOTE";
      else if (r.classification === "BLOCKED") action = "BLOCK";
      return {
        supplierId: r.supplierId,
        recommendation: action,
        classification: r.classification,
        reasons: [
          r.classification === "BLOCKED"
            ? `blocked: access=${r.platformAccessStatus}, parityFails=${r.parityFails ?? 0}, bypass=${r.adapterBypass ?? 0}`
            : r.classification === "NEEDS_WORK"
              ? `needs work: parity warnings/failures or empty platform probe`
              : "readiness + parity + platform access green",
        ],
      };
    }
    return { supplierId: "unknown", recommendation: "BLOCK" as const, reasons: [] };
  });

  const promoteCount = recommendations.filter((r) => r.recommendation === "PROMOTE").length;
  const blockCount = recommendations.filter((r) => r.recommendation === "BLOCK").length;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "8E.2",
    note: "Simulated promotion — production registry unchanged",
    simulatedPromotedSuppliers: [...PROVEN_V1_COHORT, ...PLATFORM_COHORT],
    readiness: readinessRows,
    platformAccess: platformAccessRows,
    parity: parityRows,
    search: searchRows,
    telemetrySamples,
    recommendations,
    batchAssessment: {
      canPromoteAsBatch: promoteCount === PLATFORM_COHORT.length && blockCount === 0,
      promoteCount,
      deferCount: recommendations.filter((r) => r.recommendation === "DEFER").length,
      blockCount,
      rationale:
        promoteCount === PLATFORM_COHORT.length
          ? "All suppliers pass readiness, platform access, and parity under simulated promotion"
          : blockCount > 0
            ? "One or more suppliers blocked — split or remediate before batch promotion"
            : "Mixed NEEDS_WORK — promote ready subset first",
    },
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase8e2-platform-cohort-validation-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== Phase 8E.2 Platform Cohort Validation ===\n");
  console.log(`Written: ${outPath}\n`);
  console.log("Readiness:");
  for (const row of readinessRows) {
    if (!("supplierId" in row)) continue;
    console.log(
      `  ${row.supplierId}: ${row.classification} (${row.executorType}, access=${row.platformAccessStatus})`
    );
  }
  console.log("\nRecommendations:");
  for (const r of recommendations) {
    console.log(`  ${r.supplierId}: ${r.recommendation} — ${r.reasons.join("; ")}`);
  }
  console.log("\nBatch:", JSON.stringify(report.batchAssessment, null, 2));
  console.log(
    `\nParity: PASS=${parityRows.filter((r) => r.verdict === "PASS").length} ` +
      `WARN=${parityRows.filter((r) => r.verdict === "WARNING").length} ` +
      `FAIL=${parityRows.filter((r) => r.verdict === "FAIL").length}`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
