import {
  isApiPrewarmOrchestratorFirst,
  isPromotedOrchestratorFirst,
  isPromotedOrchestratorRoutingDisabled,
  isStorefrontOrchestratorFirst,
} from "../promotedOrchestratorRouting";
import { getSupplierPromotionState } from "../routerExecutionMode";

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
  const prev = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    process.env = prev;
  }
}

console.log("\npromotedOrchestratorRouting tests\n");

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS:
      "floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv",
    FINGERPRINT_PROMOTED_ORCHESTRATOR_ROUTING_DISABLED: undefined,
    FINGERPRINT_API_ORCHESTRATOR_CONVERGENCE_DISABLED: undefined,
    FINGERPRINT_STOREFRONT_ORCHESTRATOR_CONVERGENCE_DISABLED: undefined,
  },
  () => {
    assert(
      isPromotedOrchestratorFirst("johnstone_hsv"),
      "promoted supplier is orchestrator-first"
    );
    assert(
      isApiPrewarmOrchestratorFirst("wittichen_hsv"),
      "API/prewarm orchestrator-first for promoted supplier"
    );
    assert(
      isStorefrontOrchestratorFirst("abc_supply_hsv"),
      "storefront orchestrator-first for promoted supplier"
    );
    assert(
      !isPromotedOrchestratorFirst("grainger_hsv"),
      "non-promoted supplier is not orchestrator-first"
    );
    assert(
      getSupplierPromotionState("johnstone_hsv") === "promoted",
      "promotion state is promoted"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "allowlist",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS:
      "floor_decor_hsv,johnstone_hsv,wittichen_hsv,abc_supply_hsv",
  },
  () => {
    assert(
      !isPromotedOrchestratorFirst("johnstone_hsv"),
      "allowlist mode rollback — not orchestrator-first"
    );
    assert(
      getSupplierPromotionState("johnstone_hsv") === "not_promoted",
      "allowlist mode rollback — promotion state not_promoted"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS: "",
  },
  () => {
    assert(
      !isPromotedOrchestratorFirst("johnstone_hsv"),
      "empty promotion registry rollback"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS: "johnstone_hsv",
    FINGERPRINT_PROMOTED_ORCHESTRATOR_ROUTING_DISABLED: "true",
  },
  () => {
    assert(isPromotedOrchestratorRoutingDisabled(), "global kill switch parsed");
    assert(
      !isPromotedOrchestratorFirst("johnstone_hsv"),
      "global kill switch disables orchestrator-first"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS: "johnstone_hsv",
    FINGERPRINT_API_ORCHESTRATOR_CONVERGENCE_DISABLED: "true",
  },
  () => {
    assert(
      !isApiPrewarmOrchestratorFirst("johnstone_hsv"),
      "API kill switch disables API/prewarm only"
    );
    assert(
      isStorefrontOrchestratorFirst("johnstone_hsv"),
      "storefront unaffected by API kill switch"
    );
  }
);

console.log("\nAll promotedOrchestratorRouting tests passed.\n");
