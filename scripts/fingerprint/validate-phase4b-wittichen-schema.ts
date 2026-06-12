/**
 * Phase 4B — live Wittichen SCHEMA_OR_SITEMAP validation.
 * Run: npx tsx scripts/fingerprint/validate-phase4b-wittichen-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = "wittichen_hsv";
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

const QUERIES = [
  "furnace",
  "condenser",
  "thermostat",
  "refrigerant",
  "hvac parts",
];

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

async function main() {
  console.log("\n[validate:4b] supplier=wittichen_hsv (SCHEMA_OR_SITEMAP primary)\n");

  let schemaSuccessCount = 0;
  let htmlFallbackCount = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const query of QUERIES) {
    captured.length = 0;
    const start = Date.now();
    console.log(`\n--- Query: "${query}" ---`);

    const results = await searchSupplierDiscoveryForSupplier(
      "wittichen_hsv",
      query,
      "wittichen-supply.com"
    );

    const latencyMs = Date.now() - start;
    const event = captured[captured.length - 1];
    const schemaAttempt = event?.attemptedStrategies?.find(
      (attempt) => attempt.strategy === "SCHEMA_OR_SITEMAP"
    );
    const htmlAttempt = event?.attemptedStrategies?.find(
      (attempt) => attempt.strategy === "HTML_SCRAPE"
    );

    const schemaSuccess =
      event?.finalStrategyUsed === "SCHEMA_OR_SITEMAP" &&
      (schemaAttempt?.resultCount ?? 0) >= 1 &&
      (schemaAttempt?.productPagesFetched ?? 0) >= 1;

    const htmlFallback =
      event?.finalStrategyUsed === "HTML_SCRAPE" &&
      (htmlAttempt?.extractionSuccessCount ?? 0) >= 1;

    if (schemaSuccess) schemaSuccessCount += 1;
    if (htmlFallback) htmlFallbackCount += 1;

    const row = {
      query,
      latencyMs,
      schemaSuccess,
      htmlFallback,
      resultCount: results.length,
      title: results[0]?.title ?? null,
      productUrl: results[0]?.productUrl ?? null,
      price: results[0]?.price ?? null,
      finalStrategyUsed: event?.finalStrategyUsed,
      fallbackDepth: event?.fallbackDepth,
      schemaAttempt,
      htmlAttempt,
    };
    rows.push(row);
    console.log(JSON.stringify(row, null, 2));
  }

  console.log(`\n--- Summary ---`);
  console.log(`schemaSuccessQueries: ${schemaSuccessCount}/${QUERIES.length}`);
  console.log(`htmlFallbackQueries: ${htmlFallbackCount}/${QUERIES.length}`);
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
