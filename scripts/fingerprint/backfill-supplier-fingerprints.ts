/**
 * Phase 0 + 3A — upsert SupplierFingerprint facts from legacy TS config (no router, no Serp).
 *
 *   npm run fingerprint:backfill
 *   npm run fingerprint:backfill:dry
 *   npm run fingerprint:backfill -- --probe --supplier-id abc_supply_hsv
 *   FINGERPRINT_PROBE_ENABLED=true npm run fingerprint:backfill -- --supplier-id abc_supply_hsv
 */

import { getPrisma } from "../../src/lib/db.server";
import { buildFactsFromLegacy } from "../../src/lib/suppliers/fingerprint/buildFactsFromLegacy";
import { probeRendering } from "../../src/lib/suppliers/fingerprint/probeRendering.server";
import { probeSchemaSitemap } from "../../src/lib/suppliers/fingerprint/probeSchemaSitemap.server";
import type {
  EnvKeyPresence,
  SupplierFingerprintFacts,
} from "../../src/lib/suppliers/fingerprint/types";
import {
  mergeLiveProbeFacts,
  shouldRunFingerprintProbe,
} from "../../src/lib/suppliers/fingerprint/types";
import { SUPPLIER_DOMAIN_PLATFORM_CONFIG } from "../../src/lib/suppliers/supplierDomainPlatformConfig";
import { SUPPLIER_SITE_SEARCH_CONFIG } from "../../src/lib/suppliers/supplierSiteSearchConfig";

const prisma = getPrisma();

type CliArgs = {
  dryRun: boolean;
  limit?: number;
  supplierId?: string;
  probe: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, probe: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--probe") args.probe = true;
    else if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--supplier-id") args.supplierId = argv[++i];
  }
  if (!args.probe && process.env.FINGERPRINT_PROBE_ENABLED === "true") {
    args.probe = true;
  }
  return args;
}

function collectLegacyEnvKeyNames(): string[] {
  const keys = new Set<string>();

  for (const config of Object.values(SUPPLIER_SITE_SEARCH_CONFIG)) {
    if (config.constructorPlatform?.apiKeyEnv) {
      keys.add(config.constructorPlatform.apiKeyEnv);
    }
    const br = config.bloomreach;
    if (br?.authKeyEnv) keys.add(br.authKeyEnv);
    if (br?.accountIdEnv) keys.add(br.accountIdEnv);
    if (br?.domainKeyEnv) keys.add(br.domainKeyEnv);
    const coveo = config.coveo;
    if (coveo?.apiKeyEnv) keys.add(coveo.apiKeyEnv);
    if (coveo?.organizationIdEnv) keys.add(coveo.organizationIdEnv);
    if (coveo?.searchHubEnv) keys.add(coveo.searchHubEnv);
    const algolia = config.algolia;
    if (algolia?.apiKeyEnv) keys.add(algolia.apiKeyEnv);
    if (algolia?.appIdEnv) keys.add(algolia.appIdEnv);
    if (algolia?.indexNameEnv) keys.add(algolia.indexNameEnv);
  }

  for (const config of Object.values(SUPPLIER_DOMAIN_PLATFORM_CONFIG)) {
    const br = config.bloomreach;
    if (br?.authKeyEnv) keys.add(br.authKeyEnv);
    if (br?.accountIdEnv) keys.add(br.accountIdEnv);
    if (br?.domainKeyEnv) keys.add(br.domainKeyEnv);
    const algolia = config.algolia;
    if (algolia?.apiKeyEnv) keys.add(algolia.apiKeyEnv);
    if (algolia?.appIdEnv) keys.add(algolia.appIdEnv);
    if (algolia?.indexNameEnv) keys.add(algolia.indexNameEnv);
  }

  return [...keys];
}

function buildEnvKeyPresence(): EnvKeyPresence {
  const presence: EnvKeyPresence = {};
  for (const key of collectLegacyEnvKeyNames()) {
    presence[key] = Boolean(process.env[key]?.trim());
  }
  return presence;
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function factsToRow(facts: SupplierFingerprintFacts) {
  return {
    canonicalDomain: facts.canonicalDomain,
    detectedPlatform: facts.detectedPlatform,
    platformDetectionConfidence: facts.platformDetectionConfidence,
    platformDetectionSource: facts.platformDetectionSource,
    platformBindingId: facts.platformBindingId,
    platformBindingValid: facts.platformBindingValid,
    platformAccessStatus: facts.platformAccessStatus,
    hasPublicApi: facts.hasPublicApi,
    publicApiAccessStatus: facts.publicApiAccessStatus,
    publicApiEndpoint: facts.publicApiEndpoint,
    hasSchemaMarkup: facts.hasSchemaMarkup,
    hasSitemap: facts.hasSitemap,
    sitemapUrls: facts.sitemapUrls ?? undefined,
    renderingType: facts.renderingType,
    isSPA: facts.isSPA,
    antiBotRisk: facts.antiBotRisk,
    demandPriority: facts.demandPriority,
    demandScore: facts.demandScore,
    allowSerpFallback: facts.allowSerpFallback,
    fingerprintStatus: facts.fingerprintStatus,
    lastFingerprintedAt: facts.lastFingerprintedAt,
    legacySnapshot: facts.legacySnapshot,
    notes: facts.notes,
  };
}

async function loadDemandScores(): Promise<Map<string, number>> {
  const groups = await prisma.materialRequestRecipient.groupBy({
    by: ["supplierId"],
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of groups) {
    map.set(row.supplierId, row._count._all);
  }
  return map;
}

async function enrichWithLiveProbes(
  facts: SupplierFingerprintFacts
): Promise<SupplierFingerprintFacts> {
  const domain = facts.canonicalDomain?.trim();
  if (!domain) return facts;

  const schema = await probeSchemaSitemap(domain);
  const rendering = await probeRendering(domain);

  const probeNotes = [...schema.probeNotes, ...rendering.probeNotes].join("; ");
  const merged = mergeLiveProbeFacts(facts, {
    hasSchemaMarkup: schema.hasSchemaMarkup,
    hasSitemap: schema.hasSitemap,
    sitemapUrls: schema.sitemapUrls,
    renderingType: rendering.renderingType,
    isSPA: rendering.isSPA,
    antiBotRisk: rendering.antiBotRisk,
  });

  return {
    ...merged,
    notes: facts.notes ? `${facts.notes}; ${probeNotes}` : probeNotes,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `[fingerprint:backfill] dryRun=${args.dryRun} probe=${args.probe} limit=${args.limit ?? "none"} supplierId=${args.supplierId ?? "all"}`
  );

  const envKeyPresence = buildEnvKeyPresence();
  const demandBySupplier = await loadDemandScores();

  const suppliers = await prisma.supplier.findMany({
    where: args.supplierId ? { id: args.supplierId } : undefined,
    select: { id: true, domain: true },
    orderBy: { id: "asc" },
    take: args.limit,
  });

  if (args.supplierId && suppliers.length === 0) {
    console.error(`Supplier not found: ${args.supplierId}`);
    process.exit(1);
  }

  const platformDist: Record<string, number> = {};
  const accessDist: Record<string, number> = {};
  const statusDist: Record<string, number> = {};
  let serpFallbackTrue = 0;
  let serpFallbackFalse = 0;
  let upserted = 0;
  let probed = 0;

  for (const supplier of suppliers) {
    let facts = buildFactsFromLegacy({
      supplier: { id: supplier.id, domain: supplier.domain },
      envKeyPresence,
      demandScore: demandBySupplier.get(supplier.id) ?? null,
    });

    const runProbe = shouldRunFingerprintProbe({
      probeEnabled: args.probe,
      supplierId: supplier.id,
      explicitSupplierId: args.supplierId,
    });

    if (runProbe) {
      facts = await enrichWithLiveProbes(facts);
      probed++;
      console.log(
        `[probe] ${supplier.id} hasSchemaMarkup=${facts.hasSchemaMarkup} hasSitemap=${facts.hasSitemap} sitemapUrls=${Array.isArray(facts.sitemapUrls) ? facts.sitemapUrls.length : 0} renderingType=${facts.renderingType} isSPA=${facts.isSPA} antiBotRisk=${facts.antiBotRisk}`
      );
    }

    increment(platformDist, facts.detectedPlatform);
    increment(accessDist, facts.platformAccessStatus);
    increment(statusDist, facts.fingerprintStatus);
    if (facts.allowSerpFallback) serpFallbackTrue++;
    else serpFallbackFalse++;

    if (!args.dryRun) {
      await prisma.supplierFingerprint.upsert({
        where: { supplierId: supplier.id },
        create: {
          supplierId: supplier.id,
          ...factsToRow(facts),
        },
        update: factsToRow(facts),
      });
      upserted++;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`suppliers processed: ${suppliers.length}`);
  console.log(`live probes run: ${probed}`);
  console.log(`fingerprints upserted: ${args.dryRun ? 0 : upserted}`);
  console.log(`allowSerpFallback true: ${serpFallbackTrue}`);
  console.log(`allowSerpFallback false: ${serpFallbackFalse}`);
  console.log("\ndetectedPlatform:");
  console.table(platformDist);
  console.log("\nplatformAccessStatus:");
  console.table(accessDist);
  console.log("\nfingerprintStatus:");
  console.table(statusDist);

  if (args.dryRun) {
    console.log("\nDry run complete — no rows written.");
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
