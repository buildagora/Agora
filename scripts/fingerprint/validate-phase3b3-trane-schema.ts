/**
 * Phase 3B.3 — live Trane Supply SCHEMA_OR_SITEMAP validation.
 * Run: npx tsx scripts/fingerprint/validate-phase3b3-trane-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  "abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv";
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "15000";

const QUERIES = [
  "commercial HVAC",
  "air handler",
  "trane unit",
  "rooftop unit",
  "HVAC repair",
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
  console.log("\n[validate:3b3] supplier=trane_supply_hsv\n");

  const summary: Record<string, unknown>[] = [];

  for (const query of QUERIES) {
    const start = captured.length;
    const results = await searchSupplierDiscoveryForSupplier(
      "trane_supply_hsv",
      query,
      "trane.com"
    );
    const event = captured[captured.length - 1];
    const schemaAttempt = event?.attemptedStrategies?.find(
      (attempt) => attempt.strategy === "SCHEMA_OR_SITEMAP"
    );

    summary.push({
      query,
      resultCount: results.length,
      finalStrategyUsed: event?.finalStrategyUsed,
      fallbackDepth: event?.fallbackDepth,
      executionPath: event?.executionPath,
      candidateUrlsExamined: schemaAttempt?.candidateUrlsExamined,
      productPagesFetched: schemaAttempt?.productPagesFetched,
      productPagesBlocked: schemaAttempt?.productPagesBlocked,
      firstResult: results[0]
        ? {
            title: results[0].title,
            productUrl: results[0].productUrl,
            imageUrl: results[0].imageUrl,
            price: results[0].price,
            source: results[0].source,
          }
        : null,
      schemaAttempt,
    });

    if (captured.length === start) {
      console.warn(`No telemetry captured for query: ${query}`);
    }
  }

  console.log("\n--- Trane validation summary ---\n");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
