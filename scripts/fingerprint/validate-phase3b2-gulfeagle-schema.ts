/**
 * Phase 3B.2 — live Gulf Eagle SCHEMA_OR_SITEMAP validation.
 * Run: npx tsx scripts/fingerprint/validate-phase3b2-gulfeagle-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
  "abc_supply_hsv,gulfeagle_hsv";
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "15000";

const QUERIES = [
  "shingles",
  "ridge vent",
  "underlayment",
  "roof coating",
  "metal roofing",
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
  console.log("\n[validate:3b2] supplier=gulfeagle_hsv\n");

  const summary: Record<string, unknown>[] = [];

  for (const query of QUERIES) {
    const start = captured.length;
    const results = await searchSupplierDiscoveryForSupplier(
      "gulfeagle_hsv",
      query,
      "gulfeaglesupply.com"
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

  console.log("\n--- Gulf Eagle validation summary ---\n");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
