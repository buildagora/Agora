/**
 * Phase 7A — search card live evidence tests.
 * Run: npx tsx src/lib/search/__tests__/executeSupplierSearchLiveEvidence.test.ts
 */
import type { ExtractionStrategy } from "@prisma/client";
import {
  computeBaseRankScore,
  computeLiveBoost,
  LIVE_EVIDENCE_CANDIDATE_N,
  rankSupplierCards,
  resolveLiveEvidenceSkippedReason,
} from "../liveEvidence";
import type { SupplierCard } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function withEnv(
  env: Record<string, string | undefined>,
  fn: () => void
): void {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    process.env = previous;
  }
}

console.log("\nexecuteSupplierSearchLiveEvidence tests\n");

assert(LIVE_EVIDENCE_CANDIDATE_N === 10, "candidate N is 10");

assert(
  computeLiveBoost(6, "PUBLIC_API" as ExtractionStrategy) === 1000,
  "PUBLIC_API boost is 1000"
);
assert(
  computeLiveBoost(3, "PLATFORM_API" as ExtractionStrategy) === 1000,
  "PLATFORM_API boost is 1000"
);
assert(
  computeLiveBoost(2, "SCHEMA_OR_SITEMAP" as ExtractionStrategy) === 600,
  "SCHEMA boost is 600"
);
assert(
  computeLiveBoost(1, "HTML_SCRAPE" as ExtractionStrategy) === 400,
  "HTML boost is 400"
);
assert(
  computeLiveBoost(5, "SERP_SITE_ORGANIC" as ExtractionStrategy) === 300,
  "SERP organic boost is 300"
);
assert(
  computeLiveBoost(5, "PROBABILISTIC_CATEGORY_PROFILE" as ExtractionStrategy) ===
    0,
  "PROFILE does not receive live-product boost"
);
assert(computeLiveBoost(0, "PUBLIC_API" as ExtractionStrategy) === 0, "zero results no boost");

const baseCard: SupplierCard = {
  supplierId: "floor_decor_hsv",
  name: "Floor & Decor",
  categoryId: "tile_stone",
  street: "7830 Highway 72 West",
  city: "Madison",
  state: "AL",
  phone: null,
  distanceMiles: 9,
  kind: "capability",
  confidence: "high",
};

const competitor: SupplierCard = {
  ...baseCard,
  supplierId: "tile_stone_market_hsv",
  name: "Tile Stone Market",
  distanceMiles: 2,
};

const capScores = new Map<string, number>([
  ["floor_decor_hsv", 79],
  ["tile_stone_market_hsv", 84],
]);

const rankArgs = {
  inferredCategory: "tile_stone" as const,
  capabilityScoreBySupplier: capScores,
};

const baseRanked = rankSupplierCards([competitor, baseCard], rankArgs);
assert(
  baseRanked[0].supplierId === "tile_stone_market_hsv",
  "without live boost tile specialist ranks above floor decor"
);

const liveBoost = new Map<string, number>([["floor_decor_hsv", 1000]]);
const boostedRanked = rankSupplierCards([competitor, baseCard], {
  ...rankArgs,
  liveBoostBySupplier: liveBoost,
});
assert(
  boostedRanked[0].supplierId === "floor_decor_hsv",
  "live evidence boost moves floor decor above no-live competitor"
);

const floorBase = computeBaseRankScore(baseCard, rankArgs);
const marketBase = computeBaseRankScore(competitor, rankArgs);
assert(
  floorBase + 1000 > marketBase,
  "floor decor with PUBLIC_API boost exceeds market base score"
);

withEnv(
  {
    FINGERPRINT_ROUTER_ENABLED: "false",
    FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST: "floor_decor_hsv",
  },
  () => {
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "floor_decor_hsv",
        domain: "flooranddecor.com",
        hasFingerprint: true,
      }) === "router_disabled",
      "router disabled skips stage 2"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_ENABLED: "true",
    FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST: "johnstone_hsv",
  },
  () => {
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "floor_decor_hsv",
        domain: "flooranddecor.com",
        hasFingerprint: true,
      }) === "not_allowlisted",
      "allowlist controls stage 2 eligibility"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_ENABLED: "true",
    FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST: "floor_decor_hsv",
  },
  () => {
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "floor_decor_hsv",
        domain: "flooranddecor.com",
        hasFingerprint: true,
      }) === null,
      "allowlisted supplier with domain is eligible"
    );
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "floor_decor_hsv",
        domain: null,
        hasFingerprint: true,
      }) === "no_domain_or_platform",
      "missing domain skips stage 2"
    );
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "floor_decor_hsv",
        domain: "flooranddecor.com",
        hasFingerprint: false,
      }) === "no_fingerprint",
      "missing fingerprint skips stage 2"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_ENABLED: "true",
    FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST:
      "cmn90dbjr000404ldzhcsquav,lennox_hsv",
  },
  () => {
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "cmn90dbjr000404ldzhcsquav",
        domain: null,
        hasFingerprint: true,
      }) === null,
      "registry-prefix constructor supplier eligible without DB domain"
    );
    assert(
      resolveLiveEvidenceSkippedReason({
        supplierId: "lennox_hsv",
        domain: null,
        hasFingerprint: true,
      }) === null,
      "registry-prefix hybris supplier eligible without DB domain"
    );
  }
);

console.log("\nAll executeSupplierSearchLiveEvidence tests passed.\n");
