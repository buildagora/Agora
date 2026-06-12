/**
 * Local validation for Phase 1B.2 fallback-chain control plane.
 * Run: npm run fingerprint:validate-chain
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPrisma } from "../../src/lib/db.server";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";

process.env.FINGERPRINT_ROUTER_SHADOW = "true";
process.env.FINGERPRINT_ROUTER_ENABLED = "true";

type CapturedEvent = SupplierExtractionRouteEvent;

async function findSerpPrimarySupplierId(): Promise<string | null> {
  const prisma = getPrisma();
  const rows = await prisma.supplierFingerprint.findMany({
    where: { allowSerpFallback: true },
    select: { supplierId: true, legacySnapshot: true },
    take: 200,
  });
  for (const row of rows) {
    const snapshot = row.legacySnapshot as { mode?: string; matchKind?: string } | null;
    if (snapshot?.mode === "site_organic" || snapshot?.matchKind === "generic_domain") {
      return row.supplierId;
    }
  }
  return rows[0]?.supplierId ?? null;
}

async function findPlatformPrimarySupplierId(): Promise<string | null> {
  const prisma = getPrisma();
  const row = await prisma.supplierFingerprint.findFirst({
    where: {
      platformAccessStatus: "ACCESSIBLE",
      allowSerpFallback: true,
    },
    select: { supplierId: true },
  });
  return row?.supplierId ?? null;
}

async function runScenario(
  label: string,
  supplierId: string,
  domain: string | null,
  allowlist: string[]
): Promise<CapturedEvent | null> {
  process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = allowlist.join(",");

  let captured: CapturedEvent | null = null;
  const prevInfo = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    for (const arg of args) {
      if (typeof arg === "string" && arg.includes("supplier_extraction_route")) {
        try {
          captured = JSON.parse(arg) as CapturedEvent;
          prevInfo(`[${label}] TELEMETRY:`, arg);
        } catch {
          prevInfo(`[${label}] TELEMETRY (raw):`, arg);
        }
      }
    }
    prevInfo(...args);
  };

  try {
    const results = await searchSupplierDiscoveryForSupplier(
      supplierId,
      "copper pipe",
      domain
    );
    prevInfo(`[${label}] RESULT_COUNT`, results.length);
  } finally {
    console.info = prevInfo;
  }

  return captured;
}

async function main() {
  const serpSupplierId = await findSerpPrimarySupplierId();
  if (!serpSupplierId) {
    console.error("No SERP-primary fingerprint found. Run: npm run fingerprint:backfill");
    process.exit(1);
  }

  const prisma = getPrisma();
  const serpSupplier = await prisma.supplier.findUnique({
    where: { id: serpSupplierId },
    select: { domain: true },
  });
  const serpDomain = serpSupplier?.domain ?? null;

  console.log("\n=== Phase 1B.2 local validation ===\n");
  console.log("SERP-primary supplier:", serpSupplierId, serpDomain);

  const a = await runScenario(
    "A allowlisted SERP",
    serpSupplierId,
    serpDomain,
    [serpSupplierId]
  );
  if (!a) {
    console.error("FAIL A: no telemetry captured");
  } else {
    console.log(
      "A:",
      a.routerExecutionAttempted ? "chain attempted" : "no chain",
      a.executionPath,
      a.attemptedStrategies?.map((x) => x.strategy).join(" → ") ?? "n/a"
    );
  }

  const b = await runScenario(
    "B not allowlisted",
    serpSupplierId,
    serpDomain,
    ["other_supplier_not_in_list"]
  );
  if (!b) {
    console.error("FAIL B: no telemetry captured");
  } else {
    console.log(
      "B:",
      b.executionPath,
      "routerExecutionAttempted=",
      b.routerExecutionAttempted,
      "fallbackReason=",
      b.fallbackReason ?? "n/a"
    );
  }

  const platformSupplierId = await findPlatformPrimarySupplierId();
  if (platformSupplierId) {
    const platformSupplier = await prisma.supplier.findUnique({
      where: { id: platformSupplierId },
      select: { domain: true },
    });
    console.log("\nPlatform-primary supplier:", platformSupplierId);

    const c = await runScenario(
      "C platform primary → Serp fallback",
      platformSupplierId,
      platformSupplier?.domain ?? null,
      [platformSupplierId]
    );
    if (c) {
      console.log(
        "C:",
        c.primaryStrategy,
        c.executionPath,
        "attempts:",
        c.attemptedStrategies?.map((x) => `${x.strategy}:${x.status}`).join(", ") ?? "n/a",
        "fallbackDepth=",
        c.fallbackDepth ?? "n/a"
      );
    }
  } else {
    console.log("\nC: skipped — no platform-primary + allowSerpFallback fingerprint in DB");
    console.log("C (simulated): see unit test executeExtractionStrategyChain.test.ts");
  }

  // Simulated C — platform primary falls through to Serp (no special DB facts required)
  const { runSupplierDiscoveryRouting } = await import(
    "../../src/lib/suppliers/routing/resolveSupplierExtraction.server"
  );
  const { executeExtractionStrategyChain } = await import(
    "../../src/lib/suppliers/routing/executeExtractionStrategyChain"
  );
  let simCaptured: CapturedEvent | null = null;
  process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = "sim_platform_supplier";
  await runSupplierDiscoveryRouting(
    { supplierId: "sim_platform_supplier", query: "filter", dbDomain: "johnstonesupply.com" },
    async () => [],
    {
      isShadowEnabled: () => true,
      isRouterEnabled: () => true,
      isAllowlisted: () => true,
      loadFacts: async () => ({
        supplierId: "sim_platform_supplier",
        canonicalDomain: "johnstonesupply.com",
        detectedPlatform: "SLI",
        platformDetectionConfidence: 1,
        platformDetectionSource: "legacy_config",
        platformAccessStatus: "ACCESSIBLE",
        platformBindingId: null,
        platformBindingValid: true,
        hasPublicApi: null,
        publicApiAccessStatus: "NOT_PROBED",
        publicApiEndpoint: null,
        hasSchemaMarkup: null,
        hasSitemap: null,
        sitemapUrls: null,
        renderingType: "UNKNOWN",
        isSPA: null,
        antiBotRisk: "UNKNOWN",
        demandPriority: "MEDIUM",
        demandScore: null,
        allowSerpFallback: true,
        fingerprintStatus: "SUCCESS",
        lastFingerprintedAt: null,
        legacySnapshot: {
          matchKind: "registry_prefix",
          mode: "sli",
          domain: "johnstonesupply.com",
        },
        notes: null,
      }),
      executeChain: (input, chainDeps) =>
        executeExtractionStrategyChain(input, {
          ...chainDeps,
          executeStrategy: async ({ strategy }) => {
            if (strategy === "PLATFORM_API") {
              return { status: "unsupported", reason: "strategy_platform_api" };
            }
            if (strategy === "SERP_SITE_ORGANIC") {
              return {
                status: "success",
                results: [
                  {
                    title: "Sim Product",
                    productUrl: "https://example.com/p/1",
                    supplierId: "sim_platform_supplier",
                    source: "JOHNSTONE",
                  },
                ],
              };
            }
            return { status: "unsupported", reason: "mock" };
          },
        }),
      logRoute: (payload) => {
        simCaptured = payload;
        console.log(
          "[C simulated] TELEMETRY:",
          JSON.stringify({
            executionPath: payload.executionPath,
            primaryStrategy: payload.primaryStrategy,
            attemptedStrategies: payload.attemptedStrategies,
            finalStrategyUsed: payload.finalStrategyUsed,
            fallbackDepth: payload.fallbackDepth,
          })
        );
      },
    }
  );
  if (simCaptured) {
    console.log(
      "C simulated:",
      simCaptured.executionPath,
      "fallbackDepth=",
      simCaptured.fallbackDepth
    );
  }

  console.log("\nValidation complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
