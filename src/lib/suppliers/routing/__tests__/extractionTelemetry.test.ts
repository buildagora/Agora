import {
  buildSupplierExtractionObservation,
  logAdapterBypassObservation,
} from "../extractionTelemetry";
import { formatCrossPathReportTable } from "../crossPathExtractionObservability";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nextractionTelemetry tests\n");

const observation = buildSupplierExtractionObservation({
  entryPoint: "api_product_search",
  executionPath: "adapter_bypass",
  supplierId: "johnstone_hsv",
  query: "filter drier",
  adapterBypass: true,
  executionMode: "allowlist",
  strategyUsed: "JOHNSTONE",
});

assert(observation.event === "supplier_extraction_observation", "event type");
assert(observation.adapterBypass === true, "adapterBypass flag");
assert(observation.executionPath === "adapter_bypass", "executionPath");
assert(observation.executionMode === "allowlist", "executionMode");

const report = formatCrossPathReportTable([
  {
    supplierId: "floor_decor_hsv",
    query: "tile",
    entryPoint: "search_stage2",
    executionPath: "router",
    strategyUsed: "PUBLIC_API",
    resultCount: 6,
    executionMode: "allowlist",
    observedAt: "2026-06-05T00:00:00.000Z",
  },
  {
    supplierId: "floor_decor_hsv",
    query: "tile",
    entryPoint: "api_product_search",
    executionPath: "router",
    strategyUsed: "PUBLIC_API",
    resultCount: 6,
    executionMode: "allowlist",
    observedAt: "2026-06-05T00:00:00.000Z",
  },
]);

assert(report.includes("floor_decor_hsv"), "report includes supplier");
assert(report.includes("search_stage2"), "report includes entryPoint");

let logged = "";
const prevInfo = console.info;
console.info = (msg?: unknown) => {
  logged = String(msg);
};
try {
  logAdapterBypassObservation({
    supplierId: "wittichen_hsv",
    entryPoint: "prewarm",
    query: "furnace",
    strategyUsed: "WITTICHEN",
  });
  const parsed = JSON.parse(logged);
  assert(parsed.adapterBypass === true, "logAdapterBypassObservation emits bypass");
  assert(parsed.entryPoint === "prewarm", "logAdapterBypassObservation entryPoint");
} finally {
  console.info = prevInfo;
}

console.log("\nAll extractionTelemetry tests passed.\n");
