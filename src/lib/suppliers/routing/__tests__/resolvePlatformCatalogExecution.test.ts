import { config } from "dotenv";
config({ path: ".env.local" });

import { buildFactsFromLegacy } from "../../fingerprint/buildFactsFromLegacy";
import { resolveExtractionStrategy } from "../resolveExtractionStrategy";
import {
  isPlatformApiExecutionAllowed,
  isPublicApiExecutionAllowed,
  resolvePlatformCatalogExecution,
} from "../resolvePlatformCatalogExecution";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nresolvePlatformCatalogExecution tests\n");

const johnstoneExec = resolvePlatformCatalogExecution(
  "johnstone_hsv",
  "johnstonesupply.com"
);
assert(johnstoneExec !== null, "johnstone_hsv prefix resolves platform config");
assert(johnstoneExec!.source === "JOHNSTONE", "johnstone resolves JOHNSTONE source");
assert(johnstoneExec!.config.mode === "sli", "johnstone resolves SLI mode");
assert(
  johnstoneExec!.logLabel === "Johnstone Supply",
  "johnstone resolves Johnstone Supply logLabel"
);

const floorExec = resolvePlatformCatalogExecution(
  "floor_decor_hsv",
  "flooranddecor.com"
);
assert(floorExec !== null, "floor_decor_hsv domain resolves platform config");
assert(floorExec!.config.mode === "algolia", "floor decor resolves Algolia mode");
assert(floorExec!.logLabel === "Floor & Decor", "floor decor resolves Floor & Decor logLabel");

assert(
  resolvePlatformCatalogExecution("unknown_supplier_xyz", "example.com") === null,
  "unknown supplier returns null"
);

const bakerFacts = buildFactsFromLegacy({
  supplier: { id: "baker_atl", domain: "bakerdist.com" },
});
assert(
  !isPlatformApiExecutionAllowed(bakerFacts),
  "binding-incomplete supplier does not allow PLATFORM_API execution"
);
assert(
  !isPublicApiExecutionAllowed(bakerFacts),
  "binding-incomplete supplier does not allow PUBLIC_API execution"
);

const johnstoneFacts = buildFactsFromLegacy({
  supplier: { id: "johnstone_hsv", domain: "johnstonesupply.com" },
});
assert(
  isPlatformApiExecutionAllowed(johnstoneFacts),
  "johnstone SLI ACCESSIBLE allows PLATFORM_API execution"
);
assert(
  !isPublicApiExecutionAllowed(johnstoneFacts),
  "johnstone does not allow PUBLIC_API execution"
);

const floorFacts = buildFactsFromLegacy({
  supplier: { id: "floor_decor_hsv", domain: "flooranddecor.com" },
});
assert(
  isPublicApiExecutionAllowed(floorFacts),
  "floor decor PUBLIC_ANONYMOUS allows PUBLIC_API execution"
);
assert(
  !isPlatformApiExecutionAllowed(floorFacts),
  "floor decor PUBLIC_ANONYMOUS does not allow PLATFORM_API execution"
);
const floorPlan = resolveExtractionStrategy({
  supplierId: floorFacts.supplierId,
  facts: floorFacts,
});
assert(
  floorPlan.primaryStrategy === "PUBLIC_API",
  "floor decor routes to PUBLIC_API primary"
);

const ppgFacts = buildFactsFromLegacy({
  supplier: { id: "ppg_hsv", domain: "ppgpaints.com" },
  envKeyPresence: {},
});
assert(
  !isPublicApiExecutionAllowed(ppgFacts),
  "PPG binding-incomplete does not allow PUBLIC_API execution"
);

console.log("\nAll resolvePlatformCatalogExecution tests passed.\n");
