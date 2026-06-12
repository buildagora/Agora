import {
  getFingerprintRouterAllowlist,
  isFingerprintRouterActive,
  isFingerprintRouterEnabled,
  isFingerprintRouterShadowEnabled,
  isSupplierAllowlisted,
} from "../routerFlags";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void
) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

console.log("\nrouterFlags tests\n");

withEnv({ FINGERPRINT_ROUTER_SHADOW: undefined }, () => {
  assert(!isFingerprintRouterShadowEnabled(), "shadow unset → false");
});
withEnv({ FINGERPRINT_ROUTER_SHADOW: "true" }, () => {
  assert(isFingerprintRouterShadowEnabled(), "shadow true → true");
});

withEnv({ FINGERPRINT_ROUTER_ENABLED: undefined }, () => {
  assert(!isFingerprintRouterEnabled(), "enabled unset → false");
});
withEnv({ FINGERPRINT_ROUTER_ENABLED: "true" }, () => {
  assert(isFingerprintRouterEnabled(), "enabled true → true");
});

withEnv(
  {
    FINGERPRINT_ROUTER_SHADOW: undefined,
    FINGERPRINT_ROUTER_ENABLED: undefined,
  },
  () => {
    assert(!isFingerprintRouterActive(), "active false when both off");
  }
);
withEnv({ FINGERPRINT_ROUTER_SHADOW: "true" }, () => {
  assert(isFingerprintRouterActive(), "active true when shadow on");
});

withEnv(
  {
    FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST: "ferguson_wdc,abc_supply_atl",
  },
  () => {
    const list = getFingerprintRouterAllowlist();
    assert(list.has("ferguson_wdc"), "allowlist parses ferguson_wdc");
    assert(list.has("abc_supply_atl"), "allowlist parses abc_supply_atl");
    assert(isSupplierAllowlisted("ferguson_wdc"), "isSupplierAllowlisted true");
    assert(!isSupplierAllowlisted("other"), "isSupplierAllowlisted false");
  }
);

console.log("\nAll routerFlags tests passed.\n");
