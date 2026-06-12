import { mapBloomreachResult } from "../mapBloomreachResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const config = {
  accountId: "6052",
  domainKey: "bakerdist",
  authKey: "test",
  hostname: "search.bakerdist.com",
  apiPath: "api/v1/core",
  baseImageUrl: "https://cdn.bakerdist.com/",
  siteOrigin: "https://www.bakerdist.com",
  numResults: 6,
};

console.log("\nmapBloomreachResult tests\n");

const mapped = mapBloomreachResult({
  doc: {
    pid: "123",
    title: "Copper Line Set",
    brand: "Mueller",
    url: "/product/copper-line-set",
    thumb_image: "images/123.jpg",
    sale_price: "49.99",
  },
  supplierId: "baker_hsv",
  source: "BAKER",
  config,
});

assert(mapped != null, "maps a Bloomreach doc");
if (mapped) {
  assert(mapped.title === "Copper Line Set", "title from doc.title");
  assert(mapped.brand === "Mueller", "brand from doc.brand");
  assert(
    mapped.imageUrl === "https://cdn.bakerdist.com/images/123.jpg",
    "imageUrl uses baseImageUrl"
  );
  assert(
    mapped.productUrl === "https://www.bakerdist.com/product/copper-line-set",
    "productUrl uses siteOrigin + url"
  );
  assert(mapped.classification === "PRODUCT_PAGE", "classification is PRODUCT_PAGE");
}

const missingTitle = mapBloomreachResult({
  doc: { url: "/x" },
  supplierId: "baker_hsv",
  source: "BAKER",
  config,
});
assert(missingTitle === null, "returns null when title missing");

console.log("\nAll mapBloomreachResult tests passed.\n");
