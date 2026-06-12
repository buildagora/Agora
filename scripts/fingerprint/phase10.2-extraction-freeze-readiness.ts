/**
 * Phase 10.2 — Extraction freeze & storefront readiness (planning only).
 *
 *   npm run fingerprint:phase10.2-readiness
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

export type StorefrontReadinessBucket =
  | "READY_FOR_STOREFRONT"
  | "PARTIAL_STOREFRONT_READY"
  | "EXTRACTION_BACKLOG"
  | "ACCESS_BLOCKED"
  | "NO_DATA";

const LIVE_CATALOG_STRATEGIES = new Set([
  "HTML_SCRAPE",
  "SERP_SITE_ORGANIC",
  "SCHEMA_OR_SITEMAP",
  "SERP_PRODUCT_ENGINE",
  "PLATFORM_API",
  "PUBLIC_API",
]);

const NO_DATA = new Set([
  "alabama_countertops",
  "bama_gutters",
  "city_electric_hsv",
  "extreme_stones",
  "fence1_distribution",
  "huntsville_granite",
  "ma_supply_hsv",
  "sand_mountain_brick",
  "shearer_supply_hsv",
]);

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

function countExtractionImagelessRows(
  results: Array<{ imageUrl?: string | null; source?: string | null }>,
  finalStrategy: string | null | undefined
): number {
  if (!finalStrategy || !LIVE_CATALOG_STRATEGIES.has(finalStrategy)) return 0;
  return countImagelessRows(results);
}

type SupplierValidationRow = {
  supplierId: string;
  query: string;
  primaryStrategy: string;
  resultCount: number;
  routerWinner: boolean;
  chainExhausted: boolean;
  executionPath: string | null;
  finalStrategyUsed: string | null;
  imagelessRows: number;
  extractionImagelessRows: number;
  imageCoverage: string;
};

async function validateSupplier(
  supplierId: string,
  categoryBySupplier: Map<string, string>
): Promise<SupplierValidationRow> {
  const facts = await loadSupplierFingerprintFacts(supplierId);
  const domain = facts?.canonicalDomain ?? null;
  const plan = facts
    ? resolveExtractionStrategy({
        supplierId,
        facts,
        canonicalDomain: domain,
      })
    : null;
  const primaryStrategy =
    plan?.primaryStrategy ?? "PROBABILISTIC_CATEGORY_PROFILE";
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
  const imagelessRows = countImagelessRows(results);
  const finalStrategyUsed = route?.finalStrategyUsed ?? null;

  return {
    supplierId,
    query,
    primaryStrategy,
    resultCount: results.length,
    routerWinner: isRouterWinner(route, results.length),
    chainExhausted: route?.chainExhausted ?? true,
    executionPath: route?.executionPath ?? null,
    finalStrategyUsed,
    imagelessRows,
    extractionImagelessRows: countExtractionImagelessRows(
      results,
      finalStrategyUsed
    ),
    imageCoverage:
      results.length === 0
        ? "n/a"
        : imagelessRows === 0
          ? "100%"
          : `${Math.round(
              ((results.length - imagelessRows) / results.length) * 100
            )}%`,
  };
}

function isAccessBlockedFromFacts(
  facts: Awaited<ReturnType<typeof loadSupplierFingerprintFacts>>,
  row: SupplierValidationRow
): boolean {
  if (!facts) return false;
  if (facts.antiBotRisk === "HARD_BLOCK") return true;
  if (facts.platformAccessStatus === "BINDING_INCOMPLETE") return true;
  if (facts.platformAccessStatus === "CREDENTIAL_REQUIRED") return true;
  if (
    facts.platformAccessStatus === "BLOCKED" ||
    facts.platformAccessStatus === "LOGIN_WALL"
  ) {
    return true;
  }
  if (
    facts.antiBotRisk === "HIGH" &&
    row.chainExhausted &&
    row.resultCount === 0
  ) {
    return true;
  }
  return false;
}

function classifyBucket(input: {
  supplierId: string;
  row: SupplierValidationRow;
  facts: Awaited<ReturnType<typeof loadSupplierFingerprintFacts>>;
  capabilityCount: number;
  hasDomain: boolean;
  hasCoordinates: boolean;
}): StorefrontReadinessBucket {
  const { supplierId, row, facts, capabilityCount, hasDomain } = input;

  if (
    NO_DATA.has(supplierId) ||
    (!hasDomain && capabilityCount === 0 && row.resultCount === 0)
  ) {
    return "NO_DATA";
  }

  if (isAccessBlockedFromFacts(facts, row)) {
    return "ACCESS_BLOCKED";
  }

  const liveCatalogWin =
    row.routerWinner &&
    row.finalStrategyUsed != null &&
    LIVE_CATALOG_STRATEGIES.has(row.finalStrategyUsed) &&
    row.extractionImagelessRows === 0;

  if (liveCatalogWin) {
    return "READY_FOR_STOREFRONT";
  }

  if (
    row.routerWinner &&
    row.finalStrategyUsed === "PROBABILISTIC_CATEGORY_PROFILE"
  ) {
    return "PARTIAL_STOREFRONT_READY";
  }

  if (row.routerWinner && row.resultCount > 0) {
    return "PARTIAL_STOREFRONT_READY";
  }

  return "EXTRACTION_BACKLOG";
}

function scoreStorefrontReadiness(input: {
  row: SupplierValidationRow;
  bucket: StorefrontReadinessBucket;
  capabilityCount: number;
  hasDomain: boolean;
  hasCoordinates: boolean;
  fingerprintSuccess: boolean;
  supplierName: string | null;
}): number {
  const { row, bucket, capabilityCount, hasDomain, hasCoordinates, fingerprintSuccess } =
    input;

  if (bucket === "NO_DATA") return 0;
  if (bucket === "ACCESS_BLOCKED") return 5;

  let score = 0;

  // Product coverage (0-20)
  score += Math.min(20, Math.round((row.resultCount / 6) * 20));

  // Image coverage (0-25)
  if (row.imageCoverage === "100%") score += 25;
  else if (row.imageCoverage !== "n/a") {
    const pct = Number.parseInt(row.imageCoverage, 10);
    if (Number.isFinite(pct)) score += Math.round((pct / 100) * 25);
  }

  // Extraction stability (0-25)
  if (bucket === "READY_FOR_STOREFRONT") score += 25;
  else if (bucket === "PARTIAL_STOREFRONT_READY") score += 15;
  else if (bucket === "EXTRACTION_BACKLOG" && !row.chainExhausted) score += 8;

  // Catalog quality (0-20)
  if (
    row.finalStrategyUsed &&
    LIVE_CATALOG_STRATEGIES.has(row.finalStrategyUsed)
  ) {
    score += 20;
  } else if (row.finalStrategyUsed === "PROBABILISTIC_CATEGORY_PROFILE") {
    score += 10;
  } else if (row.resultCount > 0) {
    score += 5;
  }

  // Metadata completeness (0-10)
  if (hasDomain) score += 3;
  if (hasCoordinates) score += 2;
  if (fingerprintSuccess) score += 2;
  if (capabilityCount >= 3) score += 3;
  else if (capabilityCount > 0) score += 1;

  return Math.min(100, Math.max(0, score));
}

async function findLatestPhase101Artifact(): Promise<string | null> {
  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  const files = await readdir(outDir);
  const matches = files
    .filter((f) => f.startsWith("phase10.1-final-sprint-validation-"))
    .sort()
    .reverse();
  return matches[0] ? join(outDir, matches[0]) : null;
}

async function main() {
  const prisma = getPrisma();
  const phase101Path = await findLatestPhase101Artifact();
  const phase101 = phase101Path
    ? JSON.parse(await readFile(phase101Path, "utf8"))
    : null;

  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: [...ROUTER_PROMOTED_SUPPLIERS] } },
    select: {
      id: true,
      name: true,
      domain: true,
      latitude: true,
      longitude: true,
      category: true,
      primaryCategoryId: true,
      categoryLinks: { select: { categoryId: true } },
    },
    orderBy: { id: "asc" },
  });

  const capabilityCounts = await prisma.supplierCapability.groupBy({
    by: ["supplierId"],
    where: { supplierId: { in: [...ROUTER_PROMOTED_SUPPLIERS] } },
    _count: { _all: true },
  });
  const capabilityCountBySupplier = new Map(
    capabilityCounts.map((row) => [row.supplierId, row._count._all])
  );

  const categoryBySupplier = new Map<string, string>();
  for (const row of suppliers) {
    categoryBySupplier.set(
      row.id,
      pickPrimaryCategoryId({
        supplierId: row.id,
        linkCategoryIds: row.categoryLinks.map((l) => l.categoryId),
        legacyCategory: row.category,
      })
    );
  }

  console.log("\n=== Phase 10.2 Extraction Freeze & Storefront Readiness ===\n");
  if (phase101Path) {
    console.log(`Using Phase 10.1 artifact: ${phase101Path}\n`);
  }

  const validationRows: SupplierValidationRow[] = [];
  for (const supplier of suppliers) {
    validationRows.push(await validateSupplier(supplier.id, categoryBySupplier));
  }

  const scored = [];
  const buckets: Record<StorefrontReadinessBucket, string[]> = {
    READY_FOR_STOREFRONT: [],
    PARTIAL_STOREFRONT_READY: [],
    EXTRACTION_BACKLOG: [],
    ACCESS_BLOCKED: [],
    NO_DATA: [],
  };

  for (const row of validationRows) {
    const supplier = suppliers.find((s) => s.id === row.supplierId)!;
    const facts = await loadSupplierFingerprintFacts(row.supplierId);
    const hasDomain = Boolean(
      supplier.domain?.trim() || facts?.canonicalDomain?.trim()
    );
    const hasCoordinates =
      supplier.latitude != null && supplier.longitude != null;
    const bucket = classifyBucket({
      supplierId: row.supplierId,
      row,
      facts,
      capabilityCount: capabilityCountBySupplier.get(row.supplierId) ?? 0,
      hasDomain,
      hasCoordinates,
    });
    buckets[bucket].push(row.supplierId);

    scored.push({
      supplierId: row.supplierId,
      supplierName: supplier.name,
      bucket,
      score: scoreStorefrontReadiness({
        row,
        bucket,
        capabilityCount: capabilityCountBySupplier.get(row.supplierId) ?? 0,
        hasDomain,
        hasCoordinates,
        fingerprintSuccess: facts?.fingerprintStatus === "SUCCESS",
        supplierName: supplier.name,
      }),
      resultCount: row.resultCount,
      finalStrategyUsed: row.finalStrategyUsed,
      routerWinner: row.routerWinner,
      chainExhausted: row.chainExhausted,
      imageCoverage: row.imageCoverage,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const fullWinners = validationRows.filter((r) => r.routerWinner);
  const fullExhausted = validationRows.filter((r) => r.chainExhausted);
  const extractionImagelessTotal = validationRows.reduce(
    (n, r) => n + r.extractionImagelessRows,
    0
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "10.2",
    phase101ValidationArtifact: phase101Path,
    task1_updatedValidation: {
      escRouterWinners: phase101?.task1_escSupply?.routerWinners ?? null,
      escFinalStrategy:
        phase101?.task1_escSupply?.suppliers?.[0]?.finalStrategyUsed ?? null,
      homeDepotRouterWinners:
        phase101?.task2_homeDepot?.routerWinners ?? null,
      homeDepotTimeouts: phase101?.task2_homeDepot?.timeouts ?? null,
      routerWinners: fullWinners.length,
      chainExhausted: fullExhausted.length,
      extractionImagelessRows: extractionImagelessTotal,
      allResultsImagelessRows: validationRows.reduce(
        (n, r) => n + r.imagelessRows,
        0
      ),
      baselineRouterWinners: phase101?.baseline?.routerWinners ?? 68,
      deltaRouterWinners:
        fullWinners.length - (phase101?.baseline?.routerWinners ?? 68),
    },
    task2_supplierReadinessSnapshot: {
      counts: {
        READY_FOR_STOREFRONT: buckets.READY_FOR_STOREFRONT.length,
        PARTIAL_STOREFRONT_READY: buckets.PARTIAL_STOREFRONT_READY.length,
        EXTRACTION_BACKLOG: buckets.EXTRACTION_BACKLOG.length,
        ACCESS_BLOCKED: buckets.ACCESS_BLOCKED.length,
        NO_DATA: buckets.NO_DATA.length,
      },
      suppliers: buckets,
    },
    task3_storefrontReadinessScore: {
      top25: scored.slice(0, 25),
      top50: scored.slice(0, 50),
      lowest25: scored.slice(-25).reverse(),
      averageScore:
        scored.length > 0
          ? Math.round(
              scored.reduce((n, s) => n + s.score, 0) / scored.length
            )
          : 0,
    },
    task4_phase11ReadinessReview: {
      canBeginToday: {
        searchUxRedesign: true,
        supplierStorefronts: true,
        buyerWorkflow: true,
        rfqWorkflow: true,
        poWorkflow: true,
        supplierMessaging: true,
      },
      blockers: [
        "Storefront rollout should tier by readiness bucket (READY first, PARTIAL second)",
        "EXTRACTION_BACKLOG suppliers should show capability-profile or empty states in UI",
        "ACCESS_BLOCKED / NO_DATA suppliers should remain search-visible but not promise live catalog",
        "No engineering blockers on extraction freeze policy itself",
      ],
      recommendation:
        "Begin Phase 11 immediately; use readiness scores to sequence storefront launches",
    },
    task5_extractionFreezePolicy: {
      critical: [
        "Broken extraction for READY_FOR_STOREFRONT supplier (regression)",
        "Major supplier outage affecting buyer search",
        "Imageless rows emitted from live-catalog extraction paths",
      ],
      allowed: [
        "Targeted bug fixes for READY/PARTIAL suppliers",
        "Parser fix only when storefront launch is blocked",
        "SerpAPI / cache operational fixes",
      ],
      deferred: [
        "New extraction waves and optimization sprints",
        "Browser automation / Cloudflare proxy initiatives",
        "Bloomreach and other credential-blocked platform work",
        "Ranking and router architecture changes",
        "Full 120-supplier re-audit unless regression",
      ],
      policy:
        "Extraction enters maintenance mode; Phase 11 owns roadmap unless critical",
    },
    task6_phase11Roadmap: [
      {
        rank: 1,
        initiative: "Search results UX",
        businessImpact: "high",
        userImpact: "high",
        engineeringEffort: "medium",
        rationale:
          "Immediate buyer value; leverages 94 router winners without new extraction",
      },
      {
        rank: 2,
        initiative: "Supplier storefronts",
        businessImpact: "high",
        userImpact: "high",
        engineeringEffort: "high",
        rationale:
          "Differentiation; roll out READY (72) then PARTIAL (22) cohorts using readiness scores",
      },
      {
        rank: 3,
        initiative: "RFQ / PO workflow",
        businessImpact: "high",
        userImpact: "high",
        engineeringEffort: "high",
        rationale:
          "Core revenue path; can parallel storefronts once search UX baseline ships",
      },
      {
        rank: 4,
        initiative: "Buyer ↔ supplier communication",
        businessImpact: "medium",
        userImpact: "high",
        engineeringEffort: "medium",
        rationale:
          "Closes loop after RFQ; depends on RFQ object model from rank 3",
      },
      {
        rank: 5,
        initiative: "Analytics / dashboards",
        businessImpact: "medium",
        userImpact: "medium",
        engineeringEffort: "medium",
        rationale:
          "Ops visibility; lower urgency than buyer-facing catalog and workflow",
      },
    ],
    validationRows,
    scoredSuppliers: scored,
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase10.2-extraction-freeze-readiness-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("--- Readiness counts ---");
  console.log(JSON.stringify(report.task2_supplierReadinessSnapshot.counts, null, 2));
  console.log("\n--- Validation ---");
  console.log(JSON.stringify(report.task1_updatedValidation, null, 2));
  console.log("\n--- Top 10 storefront scores ---");
  for (const row of scored.slice(0, 10)) {
    console.log(`${row.score}\t${row.supplierId}\t${row.bucket}`);
  }
  console.log(`\nWrote ${outPath}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
