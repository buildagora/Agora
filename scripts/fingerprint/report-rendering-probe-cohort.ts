/**
 * Phase 5.0 — expand rendering probes and classify Playwright candidates.
 * Run: npx tsx scripts/fingerprint/report-rendering-probe-cohort.ts
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { probeRendering } from "../../src/lib/suppliers/fingerprint/probeRendering.server";
import {
  assessCityElectric,
  getProvenTierFlags,
  rankPlaywrightCandidates,
  recommendStrategyForFacts,
  selectRenderingProbeCohort,
  type RenderingProbeCohortRow,
} from "../../src/lib/suppliers/fingerprint/renderingProbeCohort.server";
import type {
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "../../src/lib/suppliers/fingerprint/types";
import { mergeLiveProbeFacts } from "../../src/lib/suppliers/fingerprint/types";

const OUTPUT_DIR = join(process.cwd(), "scripts/output/fingerprint");
const CITY_ELECTRIC_PILOT_DIR = join(
  process.cwd(),
  "scripts/pilot/browser-extraction/output"
);

type CliArgs = {
  limit: number;
  dryRun: boolean;
  supplierId?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { limit: 30, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--supplier-id") args.supplierId = argv[++i];
  }
  return args;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function loadLatestCityElectricPilot(): Promise<{
  pass: boolean;
  cloudflareBypassed: boolean;
  productCount: number;
} | null> {
  try {
    const files = (await readdir(CITY_ELECTRIC_PILOT_DIR)).filter((f) =>
      f.startsWith("city-electric-pilot-")
    );
    if (files.length === 0) return null;
    files.sort();
    const latest = files[files.length - 1];
    const raw = JSON.parse(
      await readFile(join(CITY_ELECTRIC_PILOT_DIR, latest), "utf8")
    ) as {
      pass?: boolean;
      cloudflareBypassed?: boolean;
      productCount?: number;
    };
    return {
      pass: raw.pass === true,
      cloudflareBypassed: raw.cloudflareBypassed === true,
      productCount: raw.productCount ?? 0,
    };
  } catch {
    return null;
  }
}

function fingerprintToCohortRow(
  row: {
    supplierId: string;
    canonicalDomain: string | null;
    renderingType: RenderingProbeCohortRow["renderingType"];
    isSPA: boolean | null;
    antiBotRisk: RenderingProbeCohortRow["antiBotRisk"];
    demandPriority: RenderingProbeCohortRow["demandPriority"];
    demandScore: number | null;
    hasSitemap: boolean | null;
    hasSchemaMarkup: boolean | null;
    detectedPlatform: RenderingProbeCohortRow["detectedPlatform"];
    platformAccessStatus: RenderingProbeCohortRow["platformAccessStatus"];
    publicApiAccessStatus: RenderingProbeCohortRow["publicApiAccessStatus"];
    allowSerpFallback: boolean;
    legacySnapshot: unknown;
    supplier: { name: string | null };
  }
): RenderingProbeCohortRow {
  return {
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    canonicalDomain: row.canonicalDomain,
    renderingType: row.renderingType,
    isSPA: row.isSPA,
    antiBotRisk: row.antiBotRisk,
    demandPriority: row.demandPriority,
    demandScore: row.demandScore,
    hasSitemap: row.hasSitemap,
    hasSchemaMarkup: row.hasSchemaMarkup,
    detectedPlatform: row.detectedPlatform,
    platformAccessStatus: row.platformAccessStatus,
    publicApiAccessStatus: row.publicApiAccessStatus,
    allowSerpFallback: row.allowSerpFallback,
    legacySnapshot: (row.legacySnapshot ?? {
      matchKind: "generic_domain",
    }) as LegacyStrategySnapshot,
  };
}

function rowToFacts(
  row: RenderingProbeCohortRow,
  probe: {
    renderingType: SupplierFingerprintFacts["renderingType"];
    isSPA: boolean | null;
    antiBotRisk: SupplierFingerprintFacts["antiBotRisk"];
  }
): SupplierFingerprintFacts {
  const base: SupplierFingerprintFacts = {
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
    isSPA: row.isSPA,
    antiBotRisk: row.antiBotRisk,
    demandPriority: row.demandPriority,
    demandScore: row.demandScore,
    allowSerpFallback: row.allowSerpFallback,
    fingerprintStatus: "SUCCESS",
    lastFingerprintedAt: null,
    legacySnapshot: row.legacySnapshot,
    notes: null,
  };
  return mergeLiveProbeFacts(base, probe);
}

async function main() {
  const args = parseArgs(process.argv);
  const prisma = getPrisma();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log(
    `[phase:5.0] rendering probe cohort limit=${args.limit} dryRun=${args.dryRun}`
  );

  const fingerprints = await prisma.supplierFingerprint.findMany({
    where: args.supplierId ? { supplierId: args.supplierId } : undefined,
    include: { supplier: { select: { name: true } } },
    orderBy: { supplierId: "asc" },
  });

  const allRows = fingerprints.map(fingerprintToCohortRow);
  const cohort = args.supplierId
    ? allRows.filter((row) => row.supplierId === args.supplierId)
    : selectRenderingProbeCohort(allRows, args.limit);

  if (cohort.length === 0) {
    console.error("No suppliers selected for rendering probe cohort.");
    process.exit(1);
  }

  console.log(`Selected ${cohort.length} suppliers for rendering probe.`);

  const reportRows: Array<Record<string, unknown>> = [];
  const probeSummaries: Array<
    RenderingProbeCohortRow & {
      probeRenderingType: SupplierFingerprintFacts["renderingType"];
      probeIsSPA: boolean | null;
      probeAntiBotRisk: SupplierFingerprintFacts["antiBotRisk"];
      probeNotes: string;
      recommendedStrategy: string;
      provenTier: ReturnType<typeof getProvenTierFlags>;
    }
  > = [];

  for (const row of cohort) {
    const domain = row.canonicalDomain?.trim();
    if (!domain) continue;

    console.log(`[probe:rendering] ${row.supplierId} (${domain})`);
    const probe = await probeRendering(domain);
    const probeNotes = probe.probeNotes.join("; ");

    const facts = rowToFacts(row, {
      renderingType: probe.renderingType,
      isSPA: probe.isSPA,
      antiBotRisk: probe.antiBotRisk,
    });

    const recommendedStrategy = recommendStrategyForFacts(facts, {
      allowPlaywright: true,
    });
    const provenTier = getProvenTierFlags(row);

    if (!args.dryRun) {
      await prisma.supplierFingerprint.update({
        where: { supplierId: row.supplierId },
        data: {
          renderingType: probe.renderingType,
          isSPA: probe.isSPA,
          antiBotRisk: probe.antiBotRisk,
          lastFingerprintedAt: new Date(),
          notes: probeNotes ? `phase5.0 rendering: ${probeNotes}` : undefined,
        },
      });
    }

    const entry = {
      ...row,
      probeRenderingType: probe.renderingType,
      probeIsSPA: probe.isSPA,
      probeAntiBotRisk: probe.antiBotRisk,
      probeNotes,
      recommendedStrategy,
      provenTier,
    };
    probeSummaries.push(entry);

    reportRows.push({
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      canonicalDomain: row.canonicalDomain,
      renderingType: probe.renderingType,
      isSPA: probe.isSPA,
      antiBotRisk: probe.antiBotRisk,
      demandPriority: row.demandPriority,
      demandScore: row.demandScore,
      hasSitemap: row.hasSitemap,
      detectedPlatform: row.detectedPlatform,
      platformAccessStatus: row.platformAccessStatus,
      allowSerpFallback: row.allowSerpFallback,
      legacyMode: row.legacySnapshot.mode ?? row.legacySnapshot.matchKind,
      recommendedStrategy,
      tier1Proven: provenTier.platformApi || provenTier.publicApi,
      tier2Proven: provenTier.schemaOrSitemap || provenTier.htmlScrape,
      probeNotes,
    });
  }

  const renderingCounts = {
    SPA: 0,
    HYBRID: 0,
    SERVER_RENDERED: 0,
    UNKNOWN: 0,
  };
  const antiBotCounts: Record<string, number> = {};

  for (const row of probeSummaries) {
    renderingCounts[row.probeRenderingType] =
      (renderingCounts[row.probeRenderingType] ?? 0) + 1;
    antiBotCounts[row.probeAntiBotRisk] =
      (antiBotCounts[row.probeAntiBotRisk] ?? 0) + 1;
  }

  const playwrightCandidates = rankPlaywrightCandidates(probeSummaries);

  const cityElectricRow = probeSummaries.find(
    (row) => row.supplierId === "city_electric_hsv"
  );
  const pilot = await loadLatestCityElectricPilot();
  const cityElectricAssessment = cityElectricRow
    ? assessCityElectric({
        probeRenderingType: cityElectricRow.probeRenderingType,
        probeIsSPA: cityElectricRow.probeIsSPA,
        probeAntiBotRisk: cityElectricRow.probeAntiBotRisk,
        pilotPass: pilot?.pass ?? null,
        pilotCloudflareBlocked: pilot ? !pilot.cloudflareBypassed : null,
        pilotProductCount: pilot?.productCount ?? null,
      })
    : null;

  const firstCandidate = playwrightCandidates[0] ?? null;
  const playwrightProceed =
    firstCandidate != null && firstCandidate.score >= 30;

  const summary = {
    phase: "5.0",
    generatedAt: new Date().toISOString(),
    cohortSize: probeSummaries.length,
    dryRun: args.dryRun,
    renderingCounts,
    antiBotDistribution: antiBotCounts,
    spaCount: renderingCounts.SPA ?? 0,
    hybridCount: renderingCounts.HYBRID ?? 0,
    serverRenderedCount: renderingCounts.SERVER_RENDERED ?? 0,
    unknownRenderingCount: renderingCounts.UNKNOWN ?? 0,
    playwrightCandidates,
    cityElectricAssessment,
    recommendation: {
      proceedWithPlaywright: playwrightProceed,
      firstPlaywrightSupplier: firstCandidate?.supplierId ?? null,
      firstPlaywrightScore: firstCandidate?.score ?? null,
      deferReason: playwrightProceed
        ? null
        : "No supplier meets SPA/HYBRID + LOW/MEDIUM antiBot + unproven tier-2 criteria after live rendering probes.",
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = join(
    OUTPUT_DIR,
    `rendering-probe-cohort-${timestamp}.json`
  );
  const csvPath = join(OUTPUT_DIR, `rendering-probe-cohort-${timestamp}.csv`);

  await writeFile(
    jsonPath,
    JSON.stringify({ summary, suppliers: reportRows }, null, 2),
    "utf8"
  );

  const csvHeader = [
    "supplierId",
    "supplierName",
    "renderingType",
    "isSPA",
    "antiBotRisk",
    "demandPriority",
    "hasSitemap",
    "detectedPlatform",
    "recommendedStrategy",
    "probeNotes",
  ].join(",");

  const csvLines = reportRows.map((row) =>
    [
      row.supplierId,
      row.supplierName,
      row.renderingType,
      row.isSPA,
      row.antiBotRisk,
      row.demandPriority,
      row.hasSitemap,
      row.detectedPlatform,
      row.recommendedStrategy,
      row.probeNotes,
    ]
      .map((v) => csvEscape(String(v ?? "")))
      .join(",")
  );

  await writeFile(csvPath, [csvHeader, ...csvLines].join("\n"), "utf8");

  console.log("\n--- Summary ---");
  console.log(JSON.stringify(summary, null, 2));
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
