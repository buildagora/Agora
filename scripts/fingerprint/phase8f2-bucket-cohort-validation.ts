/**
 * Phase 8F.2 — platform credential + schema activation validation (no promotion).
 *
 *   npm run fingerprint:phase8f2-buckets
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../../src/lib/db.server";
import { loadSupplierFingerprintFacts } from "../../src/lib/suppliers/fingerprint/loadSupplierFingerprintFacts.server";
import { executePlatformCatalogSearch } from "../../src/lib/suppliers/executePlatformCatalogSearch";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import {
  isPlatformApiExecutionAllowed,
  isPublicApiExecutionAllowed,
  resolvePlatformCatalogExecution,
} from "../../src/lib/suppliers/routing/resolvePlatformCatalogExecution";
import {
  isSchemaOrSitemapExecutionAllowed,
} from "../../src/lib/suppliers/routing/resolveSchemaOrSitemapExecution";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import {
  PLATFORM_CREDENTIAL_COHORT,
  ROUTER_PROMOTED_SUPPLIERS,
  SCHEMA_ACTIVATION_COHORT,
} from "./phase6bProvenCohortParity";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_EXECUTION_MODE = "promoted";
process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS = [
  ...ROUTER_PROMOTED_SUPPLIERS,
  ...PLATFORM_CREDENTIAL_COHORT,
  ...SCHEMA_ACTIVATION_COHORT,
].join(",");
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = process.env.FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS;
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

const PLATFORM_QUERIES: Record<(typeof PLATFORM_CREDENTIAL_COHORT)[number], string> = {
  baker_hsv: "filter",
  ecmd_hsv: "copper pipe",
  east_coast_metal_hsv: "copper pipe",
  mingledorffs_hsv: "condenser",
  harbor_freight_hsv: "drill",
  fbm_hsv: "drywall",
  ppg_paint_hsv: "interior paint",
};

const SCHEMA_QUERIES: Record<(typeof SCHEMA_ACTIVATION_COHORT)[number], string> = {
  grainger_hsv: "safety gloves",
  ferguson_plumbing_hsv: "pvc pipe",
  srs_hsv: "shingles",
  shearer_supply_hsv: "filter",
  bfs_hsv: "lumber",
  city_electric_hsv: "wire",
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

async function runDiscovery(
  supplierId: string,
  query: string,
  domain: string | null,
  entryPoint: (typeof ENTRY_POINTS)[number]
) {
  const since = capturedLogs.length;
  const results = await searchSupplierDiscoveryForSupplier(
    supplierId,
    query,
    domain,
    { entryPoint }
  );
  const events = parseRouteEvents(since);
  const route = events[events.length - 1];
  return { results, route };
}

async function main() {
  const prisma = getPrisma();
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    phase: "8F.2",
    note: "Simulated promotion for validation only — production registry unchanged",
    platformCohort: [],
    schemaCohort: [],
  };

  console.log("\n=== Phase 8F.2 Bucket Cohort Validation ===\n");

  for (const supplierId of PLATFORM_CREDENTIAL_COHORT) {
    const facts = await loadSupplierFingerprintFacts(supplierId);
    const domain = facts?.canonicalDomain ?? null;
    const platformExec = resolvePlatformCatalogExecution(supplierId, domain);
    const query = PLATFORM_QUERIES[supplierId];
    const row: Record<string, unknown> = {
      supplierId,
      domain,
      platform: facts?.detectedPlatform,
      platformAccessStatus: facts?.platformAccessStatus,
      platformMode: platformExec?.config.mode ?? null,
      platformCatalogProbe: { ok: false, resultCount: 0, error: "no config" },
      discovery: [] as unknown[],
    };

    if (facts && platformExec) {
      const isPublic = platformExec.config.mode === "algolia" || platformExec.config.mode === "shopify";
      const allowed = isPublic
        ? isPublicApiExecutionAllowed(facts)
        : isPlatformApiExecutionAllowed(facts);
      if (!allowed) {
        row.platformCatalogProbe = {
          ok: false,
          resultCount: 0,
          error: `execution not allowed (${facts.platformAccessStatus})`,
        };
      } else {
        try {
          const results = await executePlatformCatalogSearch({
            supplierId,
            query,
            supplierIds: [supplierId],
            source: platformExec.source,
            logLabel: platformExec.logLabel,
            config: platformExec.config,
          });
          row.platformCatalogProbe = {
            ok: results.length > 0,
            resultCount: results.length,
            error: results.length === 0 ? "zero results" : undefined,
          };
        } catch (err) {
          row.platformCatalogProbe = {
            ok: false,
            resultCount: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    for (const entryPoint of ENTRY_POINTS) {
      const { results, route } = await runDiscovery(
        supplierId,
        query,
        domain,
        entryPoint
      );
      (row.discovery as unknown[]).push({
        entryPoint,
        resultCount: results.length,
        executionPath: route?.executionPath,
        finalStrategyUsed: route?.finalStrategyUsed,
        adapterBypass: route?.adapterBypass,
        chainExhausted: route?.chainExhausted,
      });
    }

    (report.platformCohort as unknown[]).push(row);
    const probe = row.platformCatalogProbe as { ok: boolean; resultCount: number };
    const paths = row.discovery as Array<{ finalStrategyUsed?: string; adapterBypass?: boolean }>;
    const bypass = paths.some((p) => p.adapterBypass);
    console.log(
      `${supplierId}: access=${facts?.platformAccessStatus} probe=${probe.ok ? "OK" : "FAIL"}(${probe.resultCount}) bypass=${bypass}`
    );
  }

  for (const supplierId of SCHEMA_ACTIVATION_COHORT) {
    const facts = await loadSupplierFingerprintFacts(supplierId);
    const domain = facts?.canonicalDomain ?? null;
    const query = SCHEMA_QUERIES[supplierId];
    const schemaAllowed = facts ? isSchemaOrSitemapExecutionAllowed(supplierId, facts) : false;
    const row: Record<string, unknown> = {
      supplierId,
      domain,
      schemaExecutionAllowed: schemaAllowed,
      discovery: [] as unknown[],
    };

    for (const entryPoint of ENTRY_POINTS) {
      const { results, route } = await runDiscovery(
        supplierId,
        query,
        domain,
        entryPoint
      );
      (row.discovery as unknown[]).push({
        entryPoint,
        resultCount: results.length,
        executionPath: route?.executionPath,
        finalStrategyUsed: route?.finalStrategyUsed,
        adapterBypass: route?.adapterBypass,
      });
    }

    (report.schemaCohort as unknown[]).push(row);
    const paths = row.discovery as Array<{ finalStrategyUsed?: string; resultCount: number }>;
    const schemaUsed = paths.some((p) => p.finalStrategyUsed === "SCHEMA_OR_SITEMAP");
    const anyResults = paths.some((p) => p.resultCount > 0);
    console.log(
      `${supplierId}: allow=${schemaAllowed} schemaUsed=${schemaUsed} results=${anyResults}`
    );
  }

  const outDir = join(process.cwd(), "scripts/output/fingerprint");
  await mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `phase8f2-bucket-cohort-validation-${ts}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
