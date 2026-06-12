/**
 * Phase 4C.1 — discovery URL disk cache validation.
 * Run: npx tsx scripts/fingerprint/validate-phase4c-discovery-cache.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  "abc_supply_hsv,trane_supply_hsv,wittichen_hsv";
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

const SUPPLIERS: Array<{
  id: string;
  domain: string;
  coldQuery: string;
  warmQuery: string;
}> = [
  {
    id: "abc_supply_hsv",
    domain: "abcsupply.com",
    coldQuery: "shingle",
    warmQuery: "roofing nail",
  },
  {
    id: "trane_supply_hsv",
    domain: "trane.com",
    coldQuery: "condenser",
    warmQuery: "thermostat",
  },
  {
    id: "wittichen_hsv",
    domain: "wittichen-supply.com",
    coldQuery: "furnace",
    warmQuery: "refrigerant",
  },
];

const DISCOVERY_CACHE_DIR = join(
  process.cwd(),
  "scripts",
  "cache",
  "schema-discovery-urls"
);

const captured: SupplierExtractionRouteEvent[] = [];
const originalInfo = console.info.bind(console);
console.info = (...args: unknown[]) => {
  if (args.length === 1 && typeof args[0] === "string") {
    try {
      const parsed = JSON.parse(args[0]) as { event?: string };
      if (parsed.event === "supplier_extraction_route") {
        captured.push(parsed as SupplierExtractionRouteEvent);
      }
    } catch {
      /* not JSON telemetry */
    }
  }
  originalInfo(...args);
};

function clearDiscoveryCacheForSupplier(supplierId: string) {
  if (!existsSync(DISCOVERY_CACHE_DIR)) return;
  for (const file of readdirSync(DISCOVERY_CACHE_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(
        readFileSync(join(DISCOVERY_CACHE_DIR, file), "utf8")
      ) as { supplierId?: string };
      if (raw.supplierId === supplierId) {
        rmSync(join(DISCOVERY_CACHE_DIR, file), { force: true });
      }
    } catch {
      /* skip unreadable cache files */
    }
  }
}

async function runQuery(
  supplierId: string,
  domain: string,
  query: string,
  label: string
) {
  captured.length = 0;
  const start = Date.now();
  const results = await searchSupplierDiscoveryForSupplier(
    supplierId,
    query,
    domain
  );
  const latencyMs = Date.now() - start;
  const event = captured[captured.length - 1];
  const schemaAttempt = event?.attemptedStrategies?.find(
    (attempt) => attempt.strategy === "SCHEMA_OR_SITEMAP"
  );

  const row = {
    label,
    supplierId,
    query,
    latencyMs,
    resultCount: results.length,
    title: results[0]?.title ?? null,
    finalStrategyUsed: event?.finalStrategyUsed,
    discoveryUrlCacheHit: schemaAttempt?.discoveryUrlCacheHit,
    discoveryUrlCount: schemaAttempt?.discoveryUrlCount,
    sitemapFetchCount: schemaAttempt?.sitemapFetchCount,
    sitemapParseLatencyMs: schemaAttempt?.sitemapParseLatencyMs,
    sitemapDecompressLatencyMs: schemaAttempt?.sitemapDecompressLatencyMs,
    urlRankingLatencyMs: schemaAttempt?.urlRankingLatencyMs,
    productPagesFetched: schemaAttempt?.productPagesFetched,
    schemaAttempt,
  };
  console.log(JSON.stringify(row, null, 2));
  return row;
}

async function main() {
  console.log("\n[validate:4c.1] discovery URL cache — cold vs warm\n");

  const summary: Array<Record<string, unknown>> = [];

  for (const supplier of SUPPLIERS) {
    console.log(`\n=== ${supplier.id} ===`);
    clearDiscoveryCacheForSupplier(supplier.id);

    const cold = await runQuery(
      supplier.id,
      supplier.domain,
      supplier.coldQuery,
      "cold"
    );
    const warm = await runQuery(
      supplier.id,
      supplier.domain,
      supplier.warmQuery,
      "warm"
    );
    const cacheHit = await runQuery(
      supplier.id,
      supplier.domain,
      supplier.warmQuery,
      "cache-hit-repeat"
    );

    summary.push({
      supplierId: supplier.id,
      coldLatencyMs: cold.latencyMs,
      warmLatencyMs: warm.latencyMs,
      cacheHitLatencyMs: cacheHit.latencyMs,
      warmDiscoveryUrlCacheHit: warm.discoveryUrlCacheHit,
      cacheHitDiscoveryUrlCacheHit: cacheHit.discoveryUrlCacheHit,
      warmSitemapFetchCount: warm.sitemapFetchCount,
      cacheHitSitemapFetchCount: cacheHit.sitemapFetchCount,
      warmDiscoveryUrlCount: warm.discoveryUrlCount,
    });
  }

  console.log("\n--- Summary ---");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
