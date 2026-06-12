import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupplierFingerprintFacts } from "../../fingerprint/types";
import { runFingerprintShadow } from "../resolveSupplierExtraction.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function baseFacts(supplierId: string): SupplierFingerprintFacts {
  return {
    supplierId,
    canonicalDomain: "ferguson.com",
    detectedPlatform: "UNKNOWN",
    platformDetectionConfidence: 1,
    platformDetectionSource: "legacy_config",
    platformAccessStatus: "NOT_APPLICABLE",
    platformBindingId: null,
    platformBindingValid: false,
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
    legacySnapshot: { matchKind: "site_organic", mode: "site_organic", domain: "ferguson.com" },
    notes: null,
  };
}

console.log("\nresolveSupplierExtractionShadow tests\n");

async function main() {
  let loadCalled = false;
  await runFingerprintShadow(
    { supplierId: "flag_off_supplier", canonicalDomain: "example.com" },
    {
      isShadowEnabled: () => false,
      loadFacts: async () => {
        loadCalled = true;
        return baseFacts("flag_off_supplier");
      },
      logShadow: () => {
        throw new Error("should not log when flag off");
      },
    }
  );
  assert(!loadCalled, "flag off → shadow does not load fingerprint");

  let missingLogged = false;
  await runFingerprintShadow(
    { supplierId: "missing_fp", canonicalDomain: "example.com" },
    {
      isShadowEnabled: () => true,
      loadFacts: async () => null,
      logShadow: (payload) => {
        missingLogged = payload.explanation === "fingerprint_missing";
      },
    }
  );
  assert(missingLogged, "missing fingerprint logs fingerprint_missing safely");

  let compareLogged = false;
  await runFingerprintShadow(
    { supplierId: "ferguson_wdc", canonicalDomain: "ferguson.com" },
    {
      isShadowEnabled: () => true,
      loadFacts: async () => baseFacts("ferguson_wdc"),
      logShadow: (payload) => {
        if ("legacyStrategy" in payload && payload.legacyStrategy) {
          compareLogged =
            payload.legacyStrategy === "SERP_SITE_ORGANIC" &&
            payload.routerStrategy === "SERP_SITE_ORGANIC" &&
            payload.matchStatus === "EXACT_MATCH" &&
            payload.executionPath === "legacy" &&
            payload.shadowEnabled === true;
        }
      },
    }
  );
  assert(compareLogged, "shadow runs compare + telemetry when fingerprint exists");

  await runFingerprintShadow(
    { supplierId: "err_supplier" },
    {
      isShadowEnabled: () => true,
      loadFacts: async () => {
        throw new Error("db down");
      },
      logShadow: () => {},
    }
  );
  assert(true, "shadow load errors are swallowed");

  const factsTypePath = join(process.cwd(), "src/lib/suppliers/fingerprint/types.ts");
  const factsTypeSource = readFileSync(factsTypePath, "utf8");
  assert(
    !/\n\s*chosenStrategy\b/.test(factsTypeSource),
    "SupplierFingerprintFacts has no chosenStrategy field"
  );

  console.log("\nAll resolveSupplierExtractionShadow tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
