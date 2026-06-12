/**
 * Phase 0 — compare legacy vs router strategies; write report artifacts only (no DB strategy writes).
 *
 *   npm run fingerprint:shadow
 *   npx tsx scripts/fingerprint/shadow-report.ts --only-mismatches --limit 50
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupplierFingerprint } from "@prisma/client";
import { getPrisma } from "../../src/lib/db.server";
import type {
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "../../src/lib/suppliers/fingerprint/types";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import { resolveLegacyStrategy } from "../../src/lib/suppliers/routing/resolveLegacyStrategy";
import { shadowCompare } from "../../src/lib/suppliers/routing/shadowCompare";
import type { ShadowMatchStatus } from "../../src/lib/suppliers/routing/types";

const prisma = getPrisma();
const OUTPUT_DIR = join(process.cwd(), "scripts/output/fingerprint");

type CliArgs = {
  limit?: number;
  supplierId?: string;
  onlyMismatches: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { onlyMismatches: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--supplier-id") args.supplierId = argv[++i];
    else if (token === "--only-mismatches") args.onlyMismatches = true;
  }
  return args;
}

function rowToFacts(
  supplierId: string,
  row: SupplierFingerprint
): SupplierFingerprintFacts {
  return {
    supplierId,
    canonicalDomain: row.canonicalDomain,
    detectedPlatform: row.detectedPlatform,
    platformDetectionConfidence: row.platformDetectionConfidence,
    platformDetectionSource: row.platformDetectionSource,
    platformAccessStatus: row.platformAccessStatus,
    platformBindingId: row.platformBindingId,
    platformBindingValid: row.platformBindingValid,
    hasPublicApi: row.hasPublicApi,
    publicApiAccessStatus: row.publicApiAccessStatus,
    publicApiEndpoint: row.publicApiEndpoint,
    hasSchemaMarkup: row.hasSchemaMarkup,
    hasSitemap: row.hasSitemap,
    sitemapUrls: row.sitemapUrls,
    renderingType: row.renderingType,
    isSPA: row.isSPA,
    antiBotRisk: row.antiBotRisk,
    demandPriority: row.demandPriority,
    demandScore: row.demandScore,
    allowSerpFallback: row.allowSerpFallback,
    fingerprintStatus: row.fingerprintStatus,
    lastFingerprintedAt: row.lastFingerprintedAt,
    legacySnapshot: (row.legacySnapshot ?? {
      matchKind: "generic_domain",
    }) as LegacyStrategySnapshot,
    notes: row.notes,
  };
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUTPUT_DIR, `shadow-report-${timestamp}.json`);
  const csvPath = join(OUTPUT_DIR, `shadow-report-${timestamp}.csv`);

  console.log(
    `[fingerprint:shadow] limit=${args.limit ?? "none"} supplierId=${args.supplierId ?? "all"} onlyMismatches=${args.onlyMismatches}`
  );

  const fingerprints = await prisma.supplierFingerprint.findMany({
    where: args.supplierId ? { supplierId: args.supplierId } : undefined,
    include: { supplier: { select: { id: true, name: true, domain: true } } },
    orderBy: { supplierId: "asc" },
    take: args.limit,
  });

  if (args.supplierId && fingerprints.length === 0) {
    console.error(
      `No fingerprint for supplier ${args.supplierId}. Run fingerprint:backfill first.`
    );
    process.exit(1);
  }

  const statusCounts: Record<ShadowMatchStatus, number> = {
    EXACT_MATCH: 0,
    SAME_TIER: 0,
    EXPECTED_FUTURE: 0,
    INVESTIGATE: 0,
    LEGACY_SNAPSHOT_DRIFT: 0,
  };

  const rows: Array<{
    supplierId: string;
    supplierName: string;
    canonicalDomain: string | null;
    legacyStrategy: string;
    routerStrategy: string;
    matchStatus: ShadowMatchStatus;
    mismatchType: string;
    severity: string;
    legacyTier: number;
    routerTier: number;
    explanation: string;
  }> = [];

  for (const fp of fingerprints) {
    const facts = rowToFacts(fp.supplierId, fp);
    const legacy = resolveLegacyStrategy({
      supplierId: fp.supplierId,
      canonicalDomain: facts.canonicalDomain ?? fp.supplier.domain,
      legacySnapshot: facts.legacySnapshot,
    });
    const router = resolveExtractionStrategy({
      supplierId: fp.supplierId,
      canonicalDomain: facts.canonicalDomain,
      facts,
      legacySnapshot: facts.legacySnapshot,
      options: { purpose: "shadow" },
    });
    const comparison = shadowCompare({
      legacy,
      router,
      facts,
    });

    statusCounts[comparison.matchStatus]++;

    if (args.onlyMismatches && comparison.matchStatus === "EXACT_MATCH") {
      continue;
    }

    rows.push({
      supplierId: fp.supplierId,
      supplierName: fp.supplier.name,
      canonicalDomain: facts.canonicalDomain,
      legacyStrategy: comparison.legacyStrategy,
      routerStrategy: comparison.routerStrategy,
      matchStatus: comparison.matchStatus,
      mismatchType: comparison.mismatchType,
      severity: comparison.severity,
      legacyTier: comparison.legacyTier,
      routerTier: comparison.routerTier,
      explanation: comparison.explanation,
    });
  }

  const mismatchExamples = rows
    .filter((r) => r.matchStatus !== "EXACT_MATCH")
    .slice(0, 15);

  const report = {
    generatedAt: new Date().toISOString(),
    args,
    summary: {
      totalRows: fingerprints.length,
      rowsInReport: rows.length,
      exactMatch: statusCounts.EXACT_MATCH,
      sameTier: statusCounts.SAME_TIER,
      expectedFuture: statusCounts.EXPECTED_FUTURE,
      investigate: statusCounts.INVESTIGATE,
      legacySnapshotDrift: statusCounts.LEGACY_SNAPSHOT_DRIFT,
    },
    mismatchExamples,
    rows,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const csvHeader = [
    "supplierId",
    "supplierName",
    "canonicalDomain",
    "legacyStrategy",
    "routerStrategy",
    "matchStatus",
    "mismatchType",
    "severity",
    "legacyTier",
    "routerTier",
    "explanation",
  ].join(",");
  const csvBody = rows
    .map((r) =>
      [
        r.supplierId,
        r.supplierName,
        r.canonicalDomain ?? "",
        r.legacyStrategy,
        r.routerStrategy,
        r.matchStatus,
        r.mismatchType,
        r.severity,
        String(r.legacyTier),
        String(r.routerTier),
        r.explanation,
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");
  await writeFile(csvPath, `${csvHeader}\n${csvBody}\n`, "utf8");

  console.log("\n--- Summary ---");
  console.log(`total fingerprint rows: ${fingerprints.length}`);
  console.log(`exact matches: ${statusCounts.EXACT_MATCH}`);
  console.log(`same tier: ${statusCounts.SAME_TIER}`);
  console.log(`expected future: ${statusCounts.EXPECTED_FUTURE}`);
  console.log(`investigate: ${statusCounts.INVESTIGATE}`);
  console.log(`legacy snapshot drift: ${statusCounts.LEGACY_SNAPSHOT_DRIFT}`);
  console.log(`\nJSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);

  if (mismatchExamples.length > 0) {
    console.log("\nMismatch examples (up to 15):");
    for (const ex of mismatchExamples) {
      console.log(
        `  ${ex.supplierId}: legacy=${ex.legacyStrategy} router=${ex.routerStrategy} [${ex.matchStatus}] ${ex.explanation}`
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
