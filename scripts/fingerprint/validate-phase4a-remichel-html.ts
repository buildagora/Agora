/**
 * Phase 4A — live R.E. Michel HTML_SCRAPE validation.
 * Run: npx tsx scripts/fingerprint/validate-phase4a-remichel-html.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";
process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = "re_michel_hsv";
process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "15000";

const QUERIES = ["boiler", "water heater", "copper pipe", "r22", "thermostat"];

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
  console.log("\n[validate:4a] supplier=re_michel_hsv\n");

  for (const query of QUERIES) {
    captured.length = 0;
    console.log(`\n--- Query: "${query}" ---`);

    const results = await searchSupplierDiscoveryForSupplier(
      "re_michel_hsv",
      query,
      "remichel.com"
    );

    const event = captured[captured.length - 1];
    const htmlAttempt = event?.attemptedStrategies?.find(
      (attempt) => attempt.strategy === "HTML_SCRAPE"
    );

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

    console.log(
      JSON.stringify(
        {
          finalStrategyUsed: event?.finalStrategyUsed,
          fallbackDepth: event?.fallbackDepth,
          executionPath: event?.executionPath,
          htmlAttempt,
        },
        null,
        2
      )
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
