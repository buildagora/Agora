import {
  buildRouterChainTelemetryFields,
  buildSupplierExtractionRouteEvent,
  logSupplierExtractionRoute,
  type SupplierExtractionRouteEvent,
} from "../routerTelemetry";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nrouterTelemetry tests\n");

const fullEvent: SupplierExtractionRouteEvent = {
  event: "supplier_extraction_route",
  supplierId: "ferguson_plumbing_hsv",
  explanation: "Legacy and router strategies match.",
  executionPath: "router",
  shadowEnabled: true,
  routerEnabled: true,
  routerExecutionAttempted: true,
  allowlisted: true,
  legacyStrategy: "SERP_SITE_ORGANIC",
  routerStrategy: "SERP_SITE_ORGANIC",
  primaryStrategy: "SERP_SITE_ORGANIC",
  fallbackChain: ["PROBABILISTIC_CATEGORY_PROFILE"],
  fullOrderedChain: ["SERP_SITE_ORGANIC", "PROBABILISTIC_CATEGORY_PROFILE"],
  attemptedStrategies: [
    {
      strategy: "SERP_SITE_ORGANIC",
      status: "success",
      resultCount: 3,
      latencyMs: 120,
    },
  ],
  finalStrategyUsed: "SERP_SITE_ORGANIC",
  fallbackDepth: 0,
  chainExhausted: false,
  matchStatus: "EXACT_MATCH",
  mismatchType: "NONE",
  severity: "none",
  resultCountRouter: 3,
  latencyMsRouter: 120,
  fingerprintStatus: "SUCCESS",
  detectedPlatform: "UNKNOWN",
  platformAccessStatus: "NOT_APPLICABLE",
  routerTier: 4,
};

const normalized = buildSupplierExtractionRouteEvent(fullEvent);
assert(normalized.supplierId === "ferguson_plumbing_hsv", "supplierId preserved");
assert(normalized.primaryStrategy === "SERP_SITE_ORGANIC", "primaryStrategy preserved");
assert(
  normalized.fullOrderedChain?.length === 2,
  "fullOrderedChain preserved"
);
assert(
  normalized.attemptedStrategies?.length === 1,
  "attemptedStrategies preserved"
);
assert(normalized.fallbackDepth === 0, "fallbackDepth preserved");
assert(normalized.chainExhausted === false, "chainExhausted preserved");

const withUndefined = buildSupplierExtractionRouteEvent({
  ...fullEvent,
  fallbackReason: undefined,
  resultCountLegacy: undefined,
});
assert(
  !("fallbackReason" in withUndefined),
  "undefined optional fields omitted"
);

const emptyChainDefaults = buildRouterChainTelemetryFields();
assert(emptyChainDefaults.fallbackChain.length === 0, "default fallbackChain empty");
assert(emptyChainDefaults.fullOrderedChain.length === 0, "default fullOrderedChain empty");
assert(emptyChainDefaults.attemptedStrategies.length === 0, "default attemptedStrategies empty");
assert(emptyChainDefaults.fallbackDepth === 0, "default fallbackDepth zero");
assert(emptyChainDefaults.chainExhausted === false, "default chainExhausted false");

const minimalEvent = buildSupplierExtractionRouteEvent({
  event: "supplier_extraction_route",
  supplierId: "x",
  explanation: "test",
  executionPath: "legacy",
  shadowEnabled: false,
  routerEnabled: false,
  routerExecutionAttempted: false,
  allowlisted: false,
  fallbackChain: [],
  fullOrderedChain: [],
  attemptedStrategies: [],
  fallbackDepth: 0,
  chainExhausted: false,
});
assert(
  minimalEvent.attemptedStrategies.length === 0,
  "minimal event normalizes empty attemptedStrategies"
);

let logged = "";
const prevInfo = console.info;
console.info = (msg?: unknown) => {
  logged = String(msg);
};
try {
  logSupplierExtractionRoute(fullEvent);
  assert(logged.startsWith("{"), "logSupplierExtractionRoute emits JSON");
  const parsed = JSON.parse(logged);
  assert(parsed.event === "supplier_extraction_route", "parsed event type");
  assert(parsed.executionPath === "router", "parsed executionPath");
  assert(parsed.chainExhausted === false, "parsed chainExhausted");
} finally {
  console.info = prevInfo;
}

console.info = () => {
  throw new Error("stringify failed");
};
try {
  logSupplierExtractionRoute(fullEvent);
  assert(true, "logSupplierExtractionRoute never throws on stringify failure");
} finally {
  console.info = prevInfo;
}

console.log("\nAll routerTelemetry tests passed.\n");
