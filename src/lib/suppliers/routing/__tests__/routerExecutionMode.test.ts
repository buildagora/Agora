import {
  DOMAIN_SUPPLIER_COHORT,
  ROUTER_PROMOTED_SUPPLIERS,
} from "../../../../../scripts/fingerprint/phase6bProvenCohortParity";
import {
  getPromotedSupplierIds,
  getRouterExecutionMode,
  getSupplierPromotionState,
  isPromotedSupplier,
  isRouterEligibleSupplier,
} from "../routerExecutionMode";

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

console.log("\nrouterExecutionMode tests\n");

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: undefined,
    FINGERPRINT_ROUTER_SHADOW: undefined,
    FINGERPRINT_ROUTER_ENABLED: undefined,
  },
  () => {
    assert(getRouterExecutionMode() === "off", "default mode is off");
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: undefined,
    FINGERPRINT_ROUTER_SHADOW: "true",
    FINGERPRINT_ROUTER_ENABLED: undefined,
  },
  () => {
    assert(getRouterExecutionMode() === "shadow", "shadow flag → shadow mode");
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: undefined,
    FINGERPRINT_ROUTER_SHADOW: "true",
    FINGERPRINT_ROUTER_ENABLED: "true",
  },
  () => {
    assert(
      getRouterExecutionMode() === "allowlist",
      "enabled flag → allowlist mode (legacy)"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_SHADOW: undefined,
    FINGERPRINT_ROUTER_ENABLED: undefined,
  },
  () => {
    assert(
      getRouterExecutionMode() === "promoted",
      "explicit promoted mode"
    );
  }
);

const ROUTER_PROMOTED_ENV = ROUTER_PROMOTED_SUPPLIERS.join(",");
const SPOT_CHECK_IDS = [
  "floor_decor_hsv",
  "johnstone_hsv",
  "ppg_paint_hsv",
  "ferguson_plumbing_hsv",
  "lansing_hsv",
  "home_depot_hsv",
] as const;

withEnv(
  {
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS: ROUTER_PROMOTED_ENV,
  },
  () => {
    for (const id of SPOT_CHECK_IDS) {
      assert(isPromotedSupplier(id), `isPromotedSupplier true for ${id}`);
    }
    assert(
      getPromotedSupplierIds().size === DOMAIN_SUPPLIER_COHORT.length,
      `promoted set size is ${DOMAIN_SUPPLIER_COHORT.length}`
    );
    assert(
      DOMAIN_SUPPLIER_COHORT.length === 120,
      "domain supplier cohort is 120"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS: ROUTER_PROMOTED_ENV,
  },
  () => {
    for (const id of SPOT_CHECK_IDS) {
      assert(
        getSupplierPromotionState(id) === "promoted",
        `${id} promotion state`
      );
    }
    assert(
      isRouterEligibleSupplier("gulfeagle_hsv", false),
      "promoted supplier router-eligible without allowlist"
    );
    assert(
      !isRouterEligibleSupplier("acme_brick_tile", false),
      "non-domain supplier needs allowlist"
    );
  }
);

withEnv(
  {
    FINGERPRINT_ROUTER_EXECUTION_MODE: "promoted",
    FINGERPRINT_ROUTER_PROMOTED_SUPPLIERS: "",
  },
  () => {
    for (const id of SPOT_CHECK_IDS) {
      assert(
        getSupplierPromotionState(id) === "not_promoted",
        `rollback: ${id} is not_promoted`
      );
    }
    assert(getPromotedSupplierIds().size === 0, "rollback clears promoted set");
  }
);

console.log("\nAll routerExecutionMode tests passed.\n");
