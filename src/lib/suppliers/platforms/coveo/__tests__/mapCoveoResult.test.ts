import { mapCoveoResult } from "../mapCoveoResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const config = {
  organizationId: "org-test",
  searchHub: "default",
  apiKey: "test-key",
  siteOrigin: "https://www.mingledorffs.com",
  numResults: 6,
};

console.log("\nmapCoveoResult tests\n");

const mapped = mapCoveoResult({
  result: {
    title: "Condenser Fan Motor",
    raw: {
      brand: "Genteq",
      clickableuri: "/product/condenser-fan-motor",
      thumbimage: "https://cdn.example.com/motor.jpg",
    },
  },
  supplierId: "mingledorffs_hsv",
  source: "MINGLEDORFFS",
  config,
});

assert(mapped != null, "maps a Coveo result");
if (mapped) {
  assert(mapped.title === "Condenser Fan Motor", "title from result.title");
  assert(
    mapped.productUrl === "https://www.mingledorffs.com/product/condenser-fan-motor",
    "productUrl uses siteOrigin + clickableuri"
  );
  assert(mapped.brand === "Genteq", "brand from raw.brand");
}

console.log("\nAll mapCoveoResult tests passed.\n");
