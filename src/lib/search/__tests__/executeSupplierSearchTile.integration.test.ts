/**
 * Integration checks for Phase 7A search pipeline (local DB + router env).
 * Run: npx tsx src/lib/search/__tests__/executeSupplierSearchTile.integration.test.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPrisma } from "@/lib/db.server";
import { executeSupplierSearch } from "../executeSupplierSearch";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const LOC = { label: "Huntsville, AL", lat: 34.7304, lng: -86.5861 };

async function withEnvRouterOff(fn: () => Promise<void>): Promise<void> {
  await fn();
}

async function main() {
  console.log("\nexecuteSupplierSearch tile integration tests\n");

  const prisma = getPrisma();
  const floor = await prisma.supplier.findUnique({
    where: { id: "floor_decor_hsv" },
    select: { latitude: true, longitude: true },
  });
  assert(
    floor?.latitude != null && floor?.longitude != null,
    "floor_decor_hsv has coordinates (run patch:supplier-coordinates --apply)"
  );

  await withEnvRouterOff(async () => {
    const prevEnabled = process.env.FINGERPRINT_ROUTER_ENABLED;
    const prevAllow = process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST;
    process.env.FINGERPRINT_ROUTER_ENABLED = "false";
    delete process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST;

    const off = await executeSupplierSearch({
      query: "tile",
      location: LOC,
      inferredCategoryOverride: "tile_stone",
    });
    const rankOff = off.cards.findIndex((c) => c.supplierId === "floor_decor_hsv");
    assert(rankOff >= 0, "floor_decor_hsv appears for tile with router off");
    assert(
      off.cards[rankOff].liveResultCount == null ||
        off.cards[rankOff].liveResultCount === undefined,
      "router off does not attach live evidence metadata"
    );

    process.env.FINGERPRINT_ROUTER_ENABLED = prevEnabled;
    if (prevAllow) process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST = prevAllow;
  });

  process.env.FINGERPRINT_ROUTER_ENABLED = "true";
  process.env.FINGERPRINT_ROUTER_SHADOW = "true";
  process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST =
    "johnstone_hsv,floor_decor_hsv,abc_supply_hsv,gulfeagle_hsv,trane_supply_hsv,wittichen_hsv,re_michel_hsv";
  process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS = "45000";

  const on = await executeSupplierSearch({
    query: "tile",
    location: LOC,
    inferredCategoryOverride: "tile_stone",
  });

  const rankOn = on.cards.findIndex((c) => c.supplierId === "floor_decor_hsv");
  assert(rankOn >= 0, "floor_decor_hsv appears for tile with router on");
  const card = on.cards[rankOn];
  assert(
    (card.liveResultCount ?? 0) >= 1,
    `floor_decor_hsv has liveResultCount > 0 (got ${card.liveResultCount})`
  );
  assert(
    card.liveFinalStrategyUsed === "PUBLIC_API",
    `floor_decor live strategy is PUBLIC_API (got ${card.liveFinalStrategyUsed})`
  );
  assert(card.liveEvidence === true, "floor_decor marked liveEvidence=true");

  assert(
    on.cards[0].supplierId === "floor_decor_hsv",
    "floor_decor ranks #1 with live PUBLIC_API evidence (was #3 before boost)"
  );

  const emptyRouter = await executeSupplierSearch({
    query: "tile",
    location: LOC,
    inferredCategoryOverride: "tile_stone",
    deps: {
      runStage2LiveEvidenceFn: async (args) => ({
        evidenceBySupplier: new Map([
          [
            "floor_decor_hsv",
            {
              liveEvidence: false,
              liveResultCount: 0,
              liveBoost: 0,
              skippedReason: "mock_empty",
            },
          ],
        ]),
        liveBoostBySupplier: new Map(),
        rankAfterBySupplier: new Map(),
      }),
      skipGeoTelemetry: true,
    },
  });
  assert(
    emptyRouter.cards.some((c) => c.supplierId === "floor_decor_hsv"),
    "router empty does not remove floor_decor candidate"
  );

  await prisma.$disconnect();
  console.log("\nAll tile integration tests passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
