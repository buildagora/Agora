/**
 * Phase 3B.1 — live ABC Supply SCHEMA_OR_SITEMAP validation.
 * Run: npx tsx scripts/fingerprint/validate-phase3b1-abc-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = "abc_supply_hsv";
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "15000";

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
  const query = "GAF Timberline shingles";
  console.log(`\n[validate:3b1] supplier=abc_supply_hsv query="${query}"\n`);

  const results = await searchSupplierDiscoveryForSupplier(
    "abc_supply_hsv",
    query,
    "abcsupply.com"
  );

  const event = captured[captured.length - 1];
  const schemaAttempt = event?.attemptedStrategies?.find(
    (attempt) => attempt.strategy === "SCHEMA_OR_SITEMAP"
  );

  console.log("\n--- Results ---");
  console.log(`resultCount: ${results.length}`);
  if (results[0]) {
    console.log(
      JSON.stringify(
        {
          title: results[0].title,
          productUrl: results[0].productUrl,
          imageUrl: results[0].imageUrl,
          price: results[0].price,
          source: results[0].source,
        },
        null,
        2
      )
    );
  }

  console.log("\n--- Route telemetry ---");
  console.log(
    JSON.stringify(
      {
        executionPath: event?.executionPath,
        primaryStrategy: event?.primaryStrategy,
        finalStrategyUsed: event?.finalStrategyUsed,
        fallbackDepth: event?.fallbackDepth,
        schemaAttempt,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
