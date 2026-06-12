/**
 * Phase 4C.2 — page metadata cache + sequential fetch validation.
 * Run: npx tsx scripts/fingerprint/validate-phase4c2-page-metadata-cache.ts
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
  warmSameQuery: string;
  warmDifferentQuery: string;
}> = [
  {
    id: "abc_supply_hsv",
    domain: "abcsupply.com",
    coldQuery: "shingle",
    warmSameQuery: "shingle",
    warmDifferentQuery: "roofing nail",
  },
  {
    id: "trane_supply_hsv",
    domain: "trane.com",
    coldQuery: "condenser",
    warmSameQuery: "condenser",
    warmDifferentQuery: "thermostat",
  },
  {
    id: "wittichen_hsv",
    domain: "wittichen-supply.com",
    coldQuery: "furnace",
    warmSameQuery: "furnace",
    warmDifferentQuery: "refrigerant",
  },
];

const CACHE_DIRS = {
  discovery: join(process.cwd(), "scripts", "cache", "schema-discovery-urls"),
  metadata: join(process.cwd(), "scripts", "cache", "schema-page-metadata"),
  rawHtml: join(process.cwd(), "scripts", "cache", "schema-sitemap-exec"),
};

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

function clearSupplierCaches(supplierId: string) {
  for (const dir of Object.values(CACHE_DIRS)) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
          supplierId?: string;
        };
        if (raw.supplierId === supplierId) {
          rmSync(join(dir, file), { force: true });
        }
      } catch {
        /* metadata/raw entries lack supplierId — cleared per phase below */
      }
    }
  }
}

function clearAllCachesForSupplier(supplierId: string) {
  clearSupplierCaches(supplierId);
  for (const dir of [CACHE_DIRS.metadata, CACHE_DIRS.rawHtml]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      rmSync(join(dir, file), { force: true });
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
    schemaLatencyMs: schemaAttempt?.latencyMs,
    resultCount: results.length,
    title: results[0]?.title ?? null,
    price: results[0]?.price ?? null,
    finalStrategyUsed: event?.finalStrategyUsed,
    discoveryUrlCacheHit: schemaAttempt?.discoveryUrlCacheHit,
    metadataCacheHit: schemaAttempt?.metadataCacheHit,
    metadataCacheMiss: schemaAttempt?.metadataCacheMiss,
    pageBytesFetched: schemaAttempt?.pageBytesFetched,
    averagePageFetchMs: schemaAttempt?.averagePageFetchMs,
    productPagesFetched: schemaAttempt?.productPagesFetched,
    earlyExitAfterPages: schemaAttempt?.earlyExitAfterPages,
    pageFetchFromCache: schemaAttempt?.pageFetchFromCache,
    schemaAttempt,
  };
  console.log(JSON.stringify(row, null, 2));
  return row;
}

async function main() {
  console.log("\n[validate:4c.2] page metadata cache + sequential fetch\n");
  console.log(
    "Phase 4C.1 baseline (reference): ABC warm ~68ms, Wittichen cold ~13656ms, Wittichen all-cache ~68ms\n"
  );

  const summary: Array<Record<string, unknown>> = [];

  for (const supplier of SUPPLIERS) {
    console.log(`\n=== ${supplier.id} ===`);
    clearAllCachesForSupplier(supplier.id);

    const cold = await runQuery(
      supplier.id,
      supplier.domain,
      supplier.coldQuery,
      "cold"
    );
    const warmSame = await runQuery(
      supplier.id,
      supplier.domain,
      supplier.warmSameQuery,
      "warm-same-query"
    );
    const warmDifferent = await runQuery(
      supplier.id,
      supplier.domain,
      supplier.warmDifferentQuery,
      "warm-different-query"
    );

    summary.push({
      supplierId: supplier.id,
      coldLatencyMs: cold.latencyMs,
      coldSchemaLatencyMs: cold.schemaLatencyMs,
      coldPageBytesFetched: cold.pageBytesFetched,
      coldMetadataCacheMiss: cold.metadataCacheMiss,
      coldEarlyExitAfterPages: cold.earlyExitAfterPages,
      warmSameLatencyMs: warmSame.latencyMs,
      warmSameSchemaLatencyMs: warmSame.schemaLatencyMs,
      warmSameMetadataCacheHit: warmSame.metadataCacheHit,
      warmSameProductPagesFetched: warmSame.productPagesFetched,
      warmDifferentLatencyMs: warmDifferent.latencyMs,
      warmDifferentMetadataCacheHit: warmDifferent.metadataCacheHit,
      warmDifferentMetadataCacheMiss: warmDifferent.metadataCacheMiss,
    });
  }

  console.log("\n--- Summary ---");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
