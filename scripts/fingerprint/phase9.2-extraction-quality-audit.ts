/**
 * Phase 9.2 — router execution & extraction quality audit (read-only).
 *
 *   npm run fingerprint:phase9.2-audit
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import { resolveSupplierProbeQuery } from "../../src/lib/suppliers/routing/resolveSupplierProbeQuery";
import { pickPrimaryCategoryId } from "../../src/lib/suppliers/categoryTaxonomy";
import { getSupplierPromotionState } from "../../src/lib/suppliers/routing/routerExecutionMode";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import type { SupplierProductResult } from "../../src/lib/suppliers/types";
import { executeSupplierSearch } from "../../src/lib/search/executeSupplierSearch";
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

function queryForSupplier(
  supplierId: string,
  primaryStrategy: string,
  primaryCategoryId?: string | null
): string {
  return resolveSupplierProbeQuery({
    supplierId,
    primaryStrategy,
    primaryCategoryId: primaryCategoryId as never,
  });
}

const SEARCH_SAMPLE_QUERIES = [
  { group: "Roofing", query: "shingles" },
  { group: "Roofing", query: "ridge vent" },
  { group: "Roofing", query: "flashing" },
  { group: "HVAC", query: "furnace" },
  { group: "HVAC", query: "air filter" },
  { group: "HVAC", query: "condenser" },
  { group: "Electrical", query: "breaker" },
  { group: "Electrical", query: "conduit" },
  { group: "Electrical", query: "wire" },
  { group: "Flooring", query: "tile" },
  { group: "Flooring", query: "vinyl plank" },
  { group: "Flooring", query: "flooring" },
  { group: "Lumber", query: "2x4" },
  { group: "Lumber", query: "plywood" },
  { group: "Lumber", query: "osb" },
] as const;

type QualityTier = "HIGH" | "MEDIUM" | "LOW";
type OpportunityClass = "NO_ACTION" | "MINOR_IMPROVEMENT" | "MAJOR_IMPROVEMENT";

type FallbackClass =
  | "PLATFORM_ACCESS_BLOCKED"
  | "ANTI_BOT"
  | "CLOUDFLARE"
  | "EMPTY_RESULTS"
  | "MISSING_SCHEMA"
  | "MISSING_SITEMAP"
  | "CONFIGURATION"
  | "UNKNOWN";

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

function scoreListing(result: SupplierProductResult, query: string): number {
  let score = 0;
  if (result.title?.trim()) score += 25;
  if (result.imageUrl?.trim()) score += 20;
  if (result.price?.trim()) score += 15;
  if (result.productUrl?.trim()) score += 15;
  if (result.supplierId?.trim()) score += 10;
  if (result.brand?.trim()) score += 10;
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const title = (result.title || "").toLowerCase();
  if (tokens.some((t) => title.includes(t))) score += 5;
  return Math.min(100, score);
}

function tierFromScore(avg: number, resultCount: number): QualityTier {
  if (resultCount === 0) return "LOW";
  if (avg >= 75) return "HIGH";
  if (avg >= 50) return "MEDIUM";
  return "LOW";
}

function pctPresent(results: SupplierProductResult[], field: keyof SupplierProductResult): number {
  if (results.length === 0) return 0;
  const n = results.filter((r) => {
    const v = r[field];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
  return Math.round((n / results.length) * 100);
}

function classifyFallback(route: SupplierExtractionRouteEvent | undefined): FallbackClass | null {
  if (!route || route.executionPath !== "legacy_fallback") return null;
  if (route.mismatchType === "PLATFORM_ACCESS_BLOCKED") return "PLATFORM_ACCESS_BLOCKED";
  const attempts = route.attemptedStrategies ?? [];
  const blocked = attempts.some(
    (a) =>
      (a.productPagesBlocked ?? 0) > 0 ||
      (a.pagesBlocked ?? 0) > 0 ||
      a.antiBotCategory === "HARD_BLOCK" ||
      a.antiBotCategory === "HIGH"
  );
  if (blocked) return "ANTI_BOT";
  const schemaEmpty = attempts.find((a) => a.strategy === "SCHEMA_OR_SITEMAP");
  if (schemaEmpty?.status === "empty" && (schemaEmpty.discoveryUrlCount ?? 0) === 0) {
    return "MISSING_SITEMAP";
  }
  if (schemaEmpty?.status === "empty") return "MISSING_SCHEMA";
  if (attempts.some((a) => a.reason === "supplier_not_allowlisted")) return "CONFIGURATION";
  if (route.chainExhausted && attempts.every((a) => a.status === "empty")) {
    return "EMPTY_RESULTS";
  }
  return "UNKNOWN";
}

function classifyOpportunity(input: {
  qualityTier: QualityTier;
  fallbackClass: FallbackClass | null;
  chainExhausted: boolean;
  primaryStrategy: string;
  finalStrategy?: string;
  resultCount: number;
  platformAccessStatus?: string | null;
}): OpportunityClass {
  if (input.fallbackClass === "PLATFORM_ACCESS_BLOCKED") return "MAJOR_IMPROVEMENT";
  if (input.qualityTier === "HIGH" && !input.chainExhausted && input.resultCount > 0) {
    return "NO_ACTION";
  }
  if (
    input.primaryStrategy !== input.finalStrategy &&
    input.primaryStrategy !== "PROBABILISTIC_CATEGORY_PROFILE" &&
    input.resultCount > 0
  ) {
    return "MINOR_IMPROVEMENT";
  }
  if (input.qualityTier === "LOW" || input.chainExhausted || input.resultCount === 0) {
    return "MAJOR_IMPROVEMENT";
  }
  if (input.fallbackClass || input.chainExhausted) return "MINOR_IMPROVEMENT";
  return "NO_ACTION";
}

async function main() {
  const prisma = getPrisma();
  const supplierAudits: Record<string, unknown>[] = [];
  const finalStrategyCounts: Record<string, number> = {};
  const primaryStrategyCounts: Record<string, number> = {};
  const fallbackClassCounts: Record<string, number> = {};
  let legacyFallbackCount = 0;
  let chainExhaustedCount = 0;

  console.log("\n=== Phase 9.2 Extraction Quality Audit ===\n");
  console.log(`Auditing ${DOMAIN_SUPPLIER_COHORT.length} promoted suppliers...\n`);

  const categoryBySupplier = new Map<string, string>();
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: [...DOMAIN_SUPPLIER_COHORT] } },
    select: {
      id: true,
      category: true,
      primaryCategoryId: true,
      categoryLinks: { select: { categoryId: true } },
    },
  });
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

  for (const supplierId of DOMAIN_SUPPLIER_COHORT) {
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
    const query = queryForSupplier(
      supplierId,
      primaryStrategy,
      categoryBySupplier.get(supplierId)
    );
    primaryStrategyCounts[primaryStrategy] =
      (primaryStrategyCounts[primaryStrategy] ?? 0) + 1;

    const since = capturedLogs.length;
    const results = await searchSupplierDiscoveryForSupplier(
      supplierId,
      query,
      domain,
      { entryPoint: "search_stage2" }
    );
    const route = parseRouteEvent(since);
    const finalStrategy = route?.finalStrategyUsed ?? "(none)";
    finalStrategyCounts[finalStrategy] = (finalStrategyCounts[finalStrategy] ?? 0) + 1;

    if (route?.executionPath === "legacy_fallback") legacyFallbackCount += 1;
    if (route?.chainExhausted) chainExhaustedCount += 1;

    const fallbackClass = classifyFallback(route);
    if (fallbackClass) {
      fallbackClassCounts[fallbackClass] =
        (fallbackClassCounts[fallbackClass] ?? 0) + 1;
    }

    const listingScores = results.map((r) => scoreListing(r, query));
    const avgScore =
      listingScores.length > 0
        ? Math.round(
            listingScores.reduce((s, n) => s + n, 0) / listingScores.length
          )
        : 0;
    const qualityTier = tierFromScore(avgScore, results.length);
    const opportunity = classifyOpportunity({
      qualityTier,
      fallbackClass,
      chainExhausted: route?.chainExhausted ?? false,
      primaryStrategy,
      finalStrategy: route?.finalStrategyUsed,
      resultCount: results.length,
      platformAccessStatus: facts?.platformAccessStatus,
    });

    supplierAudits.push({
      supplierId,
      query,
      primaryStrategy,
      finalStrategyUsed: route?.finalStrategyUsed ?? null,
      executionPath: route?.executionPath ?? null,
      chainExhausted: route?.chainExhausted ?? false,
      fallbackUsed: route?.executionPath === "legacy_fallback",
      fallbackClass,
      promotionState: getSupplierPromotionState(supplierId),
      resultCount: results.length,
      completenessScore: avgScore,
      qualityTier,
      opportunity,
      titlePct: pctPresent(results, "title"),
      imagePct: pctPresent(results, "imageUrl"),
      pricePct: pctPresent(results, "price"),
      brandPct: pctPresent(results, "brand"),
      adapterBypass: route?.adapterBypass ?? false,
    });

    if (supplierAudits.length % 20 === 0) {
      console.log(`  ... ${supplierAudits.length}/${DOMAIN_SUPPLIER_COHORT.length}`);
    }
  }

  const cohortStats: Record<
    string,
    {
      count: number;
      avgQuality: number;
      avgResults: number;
      fallbackRate: number;
      avgCompleteness: number;
    }
  > = {};

  for (const row of supplierAudits) {
    const r = row as {
      finalStrategyUsed: string | null;
      completenessScore: number;
      resultCount: number;
      fallbackUsed: boolean;
      titlePct: number;
      imagePct: number;
      pricePct: number;
    };
    const key = r.finalStrategyUsed ?? "(none)";
    const bucket = cohortStats[key] ?? {
      count: 0,
      avgQuality: 0,
      avgResults: 0,
      fallbackRate: 0,
      avgCompleteness: 0,
    };
    bucket.count += 1;
    bucket.avgQuality += r.completenessScore;
    bucket.avgResults += r.resultCount;
    bucket.fallbackRate += r.fallbackUsed ? 1 : 0;
    bucket.avgCompleteness += (r.titlePct + r.imagePct + r.pricePct) / 3;
    cohortStats[key] = bucket;
  }
  for (const key of Object.keys(cohortStats)) {
    const b = cohortStats[key];
    b.avgQuality = Math.round(b.avgQuality / b.count);
    b.avgResults = Math.round((b.avgResults / b.count) * 10) / 10;
    b.fallbackRate = Math.round((b.fallbackRate / b.count) * 100);
    b.avgCompleteness = Math.round(b.avgCompleteness / b.count);
  }

  const sorted = [...supplierAudits].sort(
    (a, b) =>
      (b as { completenessScore: number }).completenessScore -
      (a as { completenessScore: number }).completenessScore
  );
  const top20 = sorted.slice(0, 20);
  const bottom20 = sorted.slice(-20).reverse();

  const exhaustionLeaders = [...supplierAudits]
    .filter((r) => (r as { chainExhausted: boolean }).chainExhausted)
    .sort(
      (a, b) =>
        ((b as { resultCount: number }).resultCount === 0 ? 1 : 0) -
        ((a as { resultCount: number }).resultCount === 0 ? 1 : 0)
    )
    .slice(0, 15);

  console.log("\nRunning search quality sampling...\n");
  const searchSamples: Record<string, unknown>[] = [];
  const location = {
    label: "Huntsville, AL",
    lat: 34.7304,
    lng: -86.5861,
  };
  for (const sample of SEARCH_SAMPLE_QUERIES) {
    const res = await executeSupplierSearch({
      query: sample.query,
      location,
      radiusMiles: 25,
      maxResults: 20,
    });
    const liveCount = res.cards.filter((s) => s.liveEvidence).length;
    const withProducts = res.cards.filter(
      (s) => (s.liveResultCount ?? 0) > 0
    ).length;
    searchSamples.push({
      group: sample.group,
      query: sample.query,
      supplierCount: res.cards.length,
      liveEvidenceSuppliers: liveCount,
      suppliersWithProducts: withProducts,
      inferredCategory: res.inferredCategory,
      topSuppliers: res.cards.slice(0, 8).map((s) => ({
        supplierId: s.supplierId,
        name: s.name,
        kind: s.kind,
        liveEvidence: s.liveEvidence,
        liveResultCount: s.liveResultCount,
        liveFinalStrategyUsed: s.liveFinalStrategyUsed,
        confidence: s.confidence,
      })),
    });
    console.log(
      `  ${sample.group}/${sample.query}: ${res.cards.length} suppliers, ${liveCount} live`
    );
  }

  const opportunityCounts = { NO_ACTION: 0, MINOR_IMPROVEMENT: 0, MAJOR_IMPROVEMENT: 0 };
  for (const row of supplierAudits) {
    const o = (row as { opportunity: OpportunityClass }).opportunity;
    opportunityCounts[o] += 1;
  }

  const backlog = [...supplierAudits]
    .filter((r) => (r as { opportunity: string }).opportunity !== "NO_ACTION")
    .sort((a, b) => {
      const score = (r: Record<string, unknown>) => {
        let s = 0;
        if ((r.opportunity as string) === "MAJOR_IMPROVEMENT") s += 50;
        else s += 20;
        if ((r.resultCount as number) === 0) s += 30;
        if (r.fallbackClass) s += 15;
        if (r.chainExhausted) s += 10;
        return s;
      };
      return score(b as Record<string, unknown>) - score(a as Record<string, unknown>);
    })
    .slice(0, 25)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        supplierId: row.supplierId,
        opportunity: row.opportunity,
        primaryStrategy: row.primaryStrategy,
        finalStrategyUsed: row.finalStrategyUsed,
        fallbackClass: row.fallbackClass,
        resultCount: row.resultCount,
        qualityTier: row.qualityTier,
        recommendedFix: inferFix(row),
      };
    });

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "9.2",
    promotedCount: DOMAIN_SUPPLIER_COHORT.length,
    executionChain: {
      finalStrategyCounts,
      primaryStrategyCounts,
      legacyFallbackCount,
      legacyFallbackRate: Math.round((legacyFallbackCount / 120) * 100),
      chainExhaustedCount,
      chainExhaustedRate: Math.round((chainExhaustedCount / 120) * 100),
      exhaustionLeaders,
    },
    fallbackAnalysis: { fallbackClassCounts },
    opportunityCounts,
    cohortStats,
    top20,
    bottom20,
    searchSamples,
    optimizationBacklog: backlog,
    supplierAudits,
  };

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase9.2-extraction-quality-audit-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath}\n`);

  await prisma.$disconnect();
}

function inferFix(row: Record<string, unknown>): string {
  if (row.fallbackClass === "PLATFORM_ACCESS_BLOCKED") return "credential_unlock";
  if (row.fallbackClass === "CONFIGURATION") return "allowlist_or_platform_config";
  if (row.fallbackClass === "MISSING_SITEMAP") return "sitemap_discovery";
  if (row.fallbackClass === "MISSING_SCHEMA") return "schema_extraction";
  if (row.fallbackClass === "ANTI_BOT") return "anti_bot_mitigation";
  if (row.fallbackClass === "EMPTY_RESULTS") return "serp_or_extraction_quality";
  if ((row.resultCount as number) === 0) return "extraction_path_repair";
  if ((row.qualityTier as string) === "LOW") return "listing_completeness";
  return "monitor";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
