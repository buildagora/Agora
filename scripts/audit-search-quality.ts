/**
 * Search quality regression audit — runs the production supplier search pipeline
 * against a fixed query suite (no SerpAPI).
 *
 *   npm run audit:search-quality
 *   npx tsx scripts/audit-search-quality.ts
 *
 * Outputs:
 *   scripts/output/search-audit/search-audit.json
 *   scripts/output/search-audit/search-audit.csv
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnownCategoryId } from "@/lib/ai/classifyQuery";
import { getPrisma } from "@/lib/db.server";
import { executeSupplierSearch } from "@/lib/search/executeSupplierSearch";
import {
  computeSearchQualityScore,
  isSuspiciousSupplierCategory,
  type AuditExpectedCategory,
} from "@/lib/search/searchAuditRules";

const OUTPUT_DIR = join(process.cwd(), "scripts/output/search-audit");
const AUDIT_TOP_N = 20;
const LOCATION = {
  label: process.env.SEARCH_AUDIT_LOCATION_LABEL ?? "Huntsville, AL",
  lat: Number(process.env.SEARCH_AUDIT_LAT ?? "34.7304"),
  lng: Number(process.env.SEARCH_AUDIT_LNG ?? "-86.5861"),
};
const RADIUS_MILES = Number(process.env.SEARCH_AUDIT_RADIUS_MILES ?? "25");

type AuditQueryCase = {
  query: string;
  group: string;
  expectedCategory: AuditExpectedCategory;
};

const AUDIT_QUERIES: AuditQueryCase[] = [
  { group: "Lumber", query: "2x4", expectedCategory: "lumber_siding" },
  { group: "Lumber", query: "2x6", expectedCategory: "lumber_siding" },
  { group: "Lumber", query: "plywood", expectedCategory: "lumber_siding" },
  { group: "Lumber", query: "osb", expectedCategory: "lumber_siding" },
  { group: "Lumber", query: "lvl beam", expectedCategory: "lumber_siding" },
  { group: "Lumber", query: "framing lumber", expectedCategory: "lumber_siding" },
  { group: "Plumbing", query: "sink", expectedCategory: "plumbing" },
  { group: "Plumbing", query: "toilet", expectedCategory: "plumbing" },
  { group: "Plumbing", query: "pex pipe", expectedCategory: "plumbing" },
  { group: "Plumbing", query: "water heater", expectedCategory: "plumbing" },
  { group: "Plumbing", query: "shower valve", expectedCategory: "plumbing" },
  { group: "Electrical", query: "romex", expectedCategory: "electrical" },
  { group: "Electrical", query: "breaker panel", expectedCategory: "electrical" },
  { group: "Electrical", query: "conduit", expectedCategory: "electrical" },
  { group: "Electrical", query: "electrical wire", expectedCategory: "electrical" },
  { group: "Roofing", query: "shingles", expectedCategory: "roofing" },
  { group: "Roofing", query: "metal roofing", expectedCategory: "roofing" },
  { group: "Roofing", query: "drip edge", expectedCategory: "roofing" },
  { group: "Drywall", query: "drywall", expectedCategory: "drywall" },
  { group: "Drywall", query: "sheetrock", expectedCategory: "drywall" },
  { group: "Drywall", query: "drywall mud", expectedCategory: "drywall" },
  { group: "Concrete", query: "concrete block", expectedCategory: "concrete_cement" },
  { group: "Concrete", query: "rebar", expectedCategory: "concrete_cement" },
  { group: "Concrete", query: "ready mix", expectedCategory: "concrete_cement" },
  { group: "Paint", query: "paint", expectedCategory: "paint" },
  { group: "Paint", query: "primer", expectedCategory: "paint" },
  { group: "HVAC", query: "furnace", expectedCategory: "hvac" },
  { group: "HVAC", query: "condenser", expectedCategory: "hvac" },
  { group: "HVAC", query: "flex duct", expectedCategory: "hvac" },
];

type AuditedSupplierRow = {
  rank: number;
  supplierId: string;
  name: string;
  categoryId: string;
  distanceMiles: number;
  capabilityScore: number | null;
  confidence: string | null;
  kind: string;
  matchReason: string;
  suspicious: boolean;
  suspiciousReason: string | null;
};

type QueryAuditResult = {
  query: string;
  group: string;
  expectedCategory: AuditExpectedCategory;
  productSearchQuery: string;
  inferredCategory: string | null;
  inferredMatchesExpected: boolean;
  useCategoryFallback: boolean;
  rawMatchCount: number;
  gatedMatchCount: number;
  relevantSupplierCount: number;
  suspiciousSupplierCount: number;
  qualityScore: number;
  suppliers: AuditedSupplierRow[];
  flags: string[];
};

type SearchAuditReport = {
  generatedAt: string;
  location: typeof LOCATION;
  radiusMiles: number;
  queryCount: number;
  averageQualityScore: number;
  queries: QueryAuditResult[];
};

function escapeCsv(value: string | number | null | boolean): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(report: SearchAuditReport): string {
  const headers = [
    "query",
    "group",
    "expected_category",
    "product_search_query",
    "inferred_category",
    "inferred_matches_expected",
    "quality_score",
    "relevant_count",
    "suspicious_count",
    "rank",
    "supplier_id",
    "supplier_name",
    "supplier_category",
    "distance_miles",
    "capability_score",
    "confidence",
    "kind",
    "suspicious",
    "suspicious_reason",
    "match_reason",
  ];
  const rows: string[] = [headers.join(",")];

  for (const q of report.queries) {
    for (const s of q.suppliers) {
      rows.push(
        [
          q.query,
          q.group,
          q.expectedCategory,
          q.productSearchQuery,
          q.inferredCategory,
          q.inferredMatchesExpected,
          q.qualityScore,
          q.relevantSupplierCount,
          q.suspiciousSupplierCount,
          s.rank,
          s.supplierId,
          s.name,
          s.categoryId,
          s.distanceMiles,
          s.capabilityScore,
          s.confidence,
          s.kind,
          s.suspicious,
          s.suspiciousReason,
          s.matchReason,
        ]
          .map(escapeCsv)
          .join(",")
      );
    }
  }
  return rows.join("\n");
}

function printSummary(report: SearchAuditReport): void {
  console.log("\n" + "=".repeat(72));
  console.log("SEARCH QUALITY AUDIT SUMMARY");
  console.log("=".repeat(72));
  console.log(`Location: ${report.location.label} (${report.radiusMiles}mi)`);
  console.log(`Queries: ${report.queryCount}`);
  console.log(`Average quality score: ${report.averageQualityScore}/100\n`);

  for (const q of report.queries) {
    console.log(`Query: ${q.query}`);
    console.log(`  Group: ${q.group} | Expected: ${q.expectedCategory}`);
    console.log(
      `  Inferred: ${q.inferredCategory ?? "(none)"} | Product query: "${q.productSearchQuery}"`
    );
    console.log(
      `  Relevant suppliers: ${q.relevantSupplierCount} | Suspicious: ${q.suspiciousSupplierCount} | Quality: ${q.qualityScore}/100`
    );
    if (q.flags.length > 0) {
      console.log(`  Flags: ${q.flags.join("; ")}`);
    }
    if (q.suspiciousSupplierCount > 0) {
      const names = q.suppliers
        .filter((s) => s.suspicious)
        .map((s) => `${s.name} (${s.categoryId})`)
        .join(", ");
      console.log(`  Suspicious: ${names}`);
    }
    console.log();
  }

  const lowScores = report.queries.filter((q) => q.qualityScore < 70);
  if (lowScores.length > 0) {
    console.log("Queries below 70 quality score:");
    for (const q of lowScores) {
      console.log(`  - ${q.query}: ${q.qualityScore}`);
    }
  }
}

async function auditQuery(testCase: AuditQueryCase): Promise<QueryAuditResult> {
  const pipeline = await executeSupplierSearch({
    query: testCase.query,
    location: LOCATION,
    radiusMiles: RADIUS_MILES,
    maxResults: AUDIT_TOP_N,
  });

  const flags: string[] = [];
  if (pipeline.inferredCategory !== testCase.expectedCategory) {
    flags.push(
      `inferred category "${pipeline.inferredCategory ?? "null"}" != expected "${testCase.expectedCategory}"`
    );
  }
  if (pipeline.useCategoryFallback) {
    flags.push("used category fallback (no gated capability matches)");
  }
  if (pipeline.cards.length === 0) {
    flags.push("no suppliers returned");
  }

  const suppliers: AuditedSupplierRow[] = pipeline.suppliers
    .slice(0, AUDIT_TOP_N)
    .map((s, index) => {
      const suspicious = isSuspiciousSupplierCategory(
        s.categoryId,
        testCase.expectedCategory,
        s.kind
      );
      const suspiciousReason = suspicious
        ? `Category "${s.categoryId}" is unexpected for ${testCase.expectedCategory} intent`
        : null;
      return {
        rank: index + 1,
        supplierId: s.supplierId,
        name: s.name,
        categoryId: s.categoryId,
        distanceMiles: s.distanceMiles,
        capabilityScore: s.capabilityScore,
        confidence: s.confidence,
        kind: s.kind,
        matchReason: s.matchReason,
        suspicious,
        suspiciousReason,
      };
    });

  const suspiciousSupplierCount = suppliers.filter((s) => s.suspicious).length;
  const relevantSupplierCount = suppliers.length - suspiciousSupplierCount;

  if (suspiciousSupplierCount > 0) {
    flags.push(`${suspiciousSupplierCount} suspicious supplier(s) in top ${AUDIT_TOP_N}`);
  }

  const qualityScore = computeSearchQualityScore({
    suppliers,
    expectedCategory: testCase.expectedCategory,
    inferredCategory: pipeline.inferredCategory,
  });

  return {
    query: testCase.query,
    group: testCase.group,
    expectedCategory: testCase.expectedCategory,
    productSearchQuery: pipeline.productSearchQuery,
    inferredCategory: pipeline.inferredCategory,
    inferredMatchesExpected:
      pipeline.inferredCategory === testCase.expectedCategory,
    useCategoryFallback: pipeline.useCategoryFallback,
    rawMatchCount: pipeline.rawMatchCount,
    gatedMatchCount: pipeline.gatedMatchCount,
    relevantSupplierCount,
    suspiciousSupplierCount,
    qualityScore,
    suppliers,
    flags,
  };
}

async function main() {
  console.log("Running search quality audit (production pipeline, no SerpAPI)...");
  console.log(`Location: ${LOCATION.label} | Radius: ${RADIUS_MILES}mi`);

  const queries: QueryAuditResult[] = [];
  for (const testCase of AUDIT_QUERIES) {
    process.stdout.write(`  ${testCase.group} / ${testCase.query}...`);
    const result = await auditQuery(testCase);
    queries.push(result);
    console.log(
      ` score ${result.qualityScore} (${result.relevantSupplierCount} ok, ${result.suspiciousSupplierCount} suspicious)`
    );
  }

  const averageQualityScore =
    queries.length > 0
      ? Math.round(
          queries.reduce((sum, q) => sum + q.qualityScore, 0) / queries.length
        )
      : 0;

  const report: SearchAuditReport = {
    generatedAt: new Date().toISOString(),
    location: LOCATION,
    radiusMiles: RADIUS_MILES,
    queryCount: queries.length,
    averageQualityScore,
    queries,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = join(OUTPUT_DIR, "search-audit.json");
  const csvPath = join(OUTPUT_DIR, "search-audit.csv");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(csvPath, buildCsv(report), "utf8");

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);

  printSummary(report);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
