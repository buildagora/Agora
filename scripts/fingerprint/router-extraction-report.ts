/**
 * Phase 6A — router extraction plan + optional live chain report.
 *
 *   npx tsx scripts/fingerprint/router-extraction-report.ts
 *   npx tsx scripts/fingerprint/router-extraction-report.ts --execute --query shingles --allowlist wittichen_hsv
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtractionStrategy, SupplierFingerprint } from "@prisma/client";
import { getPrisma } from "../../src/lib/db.server";
import type {
  LegacyStrategySnapshot,
  SupplierFingerprintFacts,
} from "../../src/lib/suppliers/fingerprint/types";
import {
  DEFERRED_EXTRACTION_STRATEGIES,
  STRATEGY_PLAN_ORDER,
} from "../../src/lib/suppliers/routing/evaluateStrategyViability";
import { resolveExtractionStrategy } from "../../src/lib/suppliers/routing/resolveExtractionStrategy";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import type { StrategyExecutionAttempt } from "../../src/lib/suppliers/routing/types";

const OUTPUT_DIR = join(process.cwd(), "scripts/output/fingerprint");

type CliArgs = {
  limit?: number;
  supplierId?: string;
  execute: boolean;
  query: string;
  allowlist: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { execute: false, query: "shingles", allowlist: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--supplier-id") args.supplierId = argv[++i];
    else if (token === "--execute") args.execute = true;
    else if (token === "--query") args.query = argv[++i];
    else if (token === "--allowlist") {
      args.allowlist = (argv[++i] ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }
  }
  return args;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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

function summarizeAntiBotFromAttempts(
  attempts: StrategyExecutionAttempt[] | undefined
): {
  pagesBlocked: number;
  antiBotRisk?: string;
  antiBotCategory?: string;
  blockedUrlClass?: string;
} {
  let pagesBlocked = 0;
  let antiBotRisk: string | undefined;
  let antiBotCategory: string | undefined;
  let blockedUrlClass: string | undefined;

  for (const attempt of attempts ?? []) {
    pagesBlocked += attempt.pagesBlocked ?? attempt.productPagesBlocked ?? 0;
    if (attempt.antiBotRisk) antiBotRisk = attempt.antiBotRisk;
    if (attempt.antiBotCategory) antiBotCategory = attempt.antiBotCategory;
    if (attempt.blockedUrlClass) blockedUrlClass = attempt.blockedUrlClass;
  }

  return { pagesBlocked, antiBotRisk, antiBotCategory, blockedUrlClass };
}

function planContainsDeferred(chain: ExtractionStrategy[]): boolean {
  return chain.some((strategy) => DEFERRED_EXTRACTION_STRATEGIES.includes(strategy));
}

async function runLiveExtraction(input: {
  supplierId: string;
  domain: string | null;
  query: string;
  allowlist: string[];
}): Promise<{
  finalStrategyUsed?: ExtractionStrategy;
  fallbackDepth: number;
  chainExhausted: boolean;
  resultCount: number;
  latencyMs: number;
  attempts: StrategyExecutionAttempt[];
}> {
  process.env.FINGERPRINT_ROUTER_SHADOW = "true";
  process.env.FINGERPRINT_ROUTER_ENABLED = "true";
  process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = input.allowlist.join(",");

  const { searchSupplierDiscoveryForSupplier } = await import(
    "../../src/lib/suppliers/resolveSupplierDiscovery"
  );

  let captured: SupplierExtractionRouteEvent | null = null;
  const prevInfo = console.info.bind(console);
  console.info = (...logArgs: unknown[]) => {
    for (const arg of logArgs) {
      if (typeof arg === "string" && arg.includes("supplier_extraction_route")) {
        try {
          captured = JSON.parse(arg) as SupplierExtractionRouteEvent;
        } catch {
          /* ignore */
        }
      }
    }
    prevInfo(...logArgs);
  };

  const start = Date.now();
  try {
    const results = await searchSupplierDiscoveryForSupplier(
      input.supplierId,
      input.query,
      input.domain
    );
    const latencyMs = Date.now() - start;
    return {
      finalStrategyUsed: captured?.finalStrategyUsed,
      fallbackDepth: captured?.fallbackDepth ?? 0,
      chainExhausted: captured?.chainExhausted ?? false,
      resultCount: results.length,
      latencyMs: captured?.latencyMsRouter ?? latencyMs,
      attempts: captured?.attemptedStrategies ?? [],
    };
  } finally {
    console.info = prevInfo;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUTPUT_DIR, `router-extraction-report-${timestamp}.json`);
  const csvPath = join(OUTPUT_DIR, `router-extraction-report-${timestamp}.csv`);

  console.log(
    `[phase:6A] router-extraction-report execute=${args.execute} query=${args.query} allowlist=${args.allowlist.join("|") || "none"}`
  );

  const prisma = getPrisma();
  const fingerprints = await prisma.supplierFingerprint.findMany({
    where: args.supplierId ? { supplierId: args.supplierId } : undefined,
    include: { supplier: { select: { id: true, name: true, domain: true } } },
    orderBy: { supplierId: "asc" },
    take: args.limit,
  });

  if (args.supplierId && fingerprints.length === 0) {
    console.error(`No fingerprint for supplier ${args.supplierId}`);
    process.exit(1);
  }

  const rows: Array<{
    supplierId: string;
    supplierName: string;
    primaryStrategy: string;
    fullOrderedChain: string;
    finalStrategyUsed: string;
    fallbackDepth: number;
    chainExhausted: boolean;
    resultCount: number | null;
    latencyMs: number | null;
    fingerprintAntiBotRisk: string;
    pagesBlocked: number;
    antiBotCategory: string;
    blockedUrlClass: string;
    mode: "plan" | "execute";
  }> = [];

  for (const fp of fingerprints) {
    const facts = rowToFacts(fp.supplierId, fp);
    const router = resolveExtractionStrategy({
      supplierId: fp.supplierId,
      canonicalDomain: facts.canonicalDomain ?? fp.supplier.domain,
      facts,
      legacySnapshot: facts.legacySnapshot,
      options: { purpose: "shadow" },
    });

    if (planContainsDeferred(router.fullOrderedChain)) {
      console.warn(
        `[warn] ${fp.supplierId} plan contains deferred strategy — unexpected`
      );
    }

    let finalStrategyUsed = "";
    let fallbackDepth = 0;
    let chainExhausted = false;
    let resultCount: number | null = null;
    let latencyMs: number | null = null;
    let pagesBlocked = 0;
    let antiBotCategory = "";
    let blockedUrlClass = "";
    let attemptAntiBotRisk = "";
    let mode: "plan" | "execute" = "plan";

    const shouldExecute =
      args.execute &&
      (args.allowlist.length === 0 || args.allowlist.includes(fp.supplierId));

    if (shouldExecute) {
      mode = "execute";
      const live = await runLiveExtraction({
        supplierId: fp.supplierId,
        domain: fp.supplier.domain,
        query: args.query,
        allowlist:
          args.allowlist.length > 0 ? args.allowlist : [fp.supplierId],
      });
      finalStrategyUsed = live.finalStrategyUsed ?? "";
      fallbackDepth = live.fallbackDepth;
      chainExhausted = live.chainExhausted;
      resultCount = live.resultCount;
      latencyMs = live.latencyMs;
      const antiBot = summarizeAntiBotFromAttempts(live.attempts);
      pagesBlocked = antiBot.pagesBlocked;
      antiBotCategory = antiBot.antiBotCategory ?? "";
      blockedUrlClass = antiBot.blockedUrlClass ?? "";
      attemptAntiBotRisk = antiBot.antiBotRisk ?? "";
    }

    rows.push({
      supplierId: fp.supplierId,
      supplierName: fp.supplier.name,
      primaryStrategy: router.primaryStrategy,
      fullOrderedChain: router.fullOrderedChain.join(" → "),
      finalStrategyUsed,
      fallbackDepth,
      chainExhausted,
      resultCount,
      latencyMs,
      fingerprintAntiBotRisk: fp.antiBotRisk,
      pagesBlocked,
      antiBotCategory,
      blockedUrlClass:
        blockedUrlClass || attemptAntiBotRisk
          ? blockedUrlClass
          : "",
      mode,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "6A",
    args,
    activeStrategyPlanOrder: STRATEGY_PLAN_ORDER,
    deferredStrategies: DEFERRED_EXTRACTION_STRATEGIES,
    summary: {
      totalSuppliers: fingerprints.length,
      executeModeRows: rows.filter((r) => r.mode === "execute").length,
      uniquePrimaryStrategies: [...new Set(rows.map((r) => r.primaryStrategy))],
    },
    rows,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const csvHeader = [
    "supplierId",
    "supplierName",
    "primaryStrategy",
    "fullOrderedChain",
    "finalStrategyUsed",
    "fallbackDepth",
    "chainExhausted",
    "resultCount",
    "latencyMs",
    "fingerprintAntiBotRisk",
    "pagesBlocked",
    "antiBotCategory",
    "blockedUrlClass",
    "mode",
  ].join(",");
  const csvBody = rows
    .map((r) =>
      [
        r.supplierId,
        r.supplierName,
        r.primaryStrategy,
        r.fullOrderedChain,
        r.finalStrategyUsed,
        String(r.fallbackDepth),
        String(r.chainExhausted),
        r.resultCount == null ? "" : String(r.resultCount),
        r.latencyMs == null ? "" : String(r.latencyMs),
        r.fingerprintAntiBotRisk,
        String(r.pagesBlocked),
        r.antiBotCategory,
        r.blockedUrlClass,
        r.mode,
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");
  await writeFile(csvPath, `${csvHeader}\n${csvBody}\n`, "utf8");

  console.log("\n--- Summary ---");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);

  if (rows.length > 0) {
    console.log("\nSample row:");
    console.log(JSON.stringify(rows[0], null, 2));
  }
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
