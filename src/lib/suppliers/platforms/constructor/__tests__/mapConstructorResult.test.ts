import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapConstructorResult } from "../mapConstructorResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "shingles-result.json"), "utf8")
);

const config = {
  apiKey: "test-key",
  baseUrl: "https://ac.cnstrc.com",
  numResultsPerPage: 6,
  imageCdnBase: "https://static-ng.becn.digital",
  siteOrigin: "https://www.qxo.com",
};

console.log("\nmapConstructorResult tests\n");

const mapped = mapConstructorResult({
  result: fixture,
  supplierId: "cmn90dbjr000404ldzhcsquav",
  source: "QXO",
  config,
});

assert(mapped != null, "maps a real shingles fixture row");

if (mapped) {
  assert(
    mapped.title === "Timberline HDZ&trade; Shingles with StainGuard Protection",
    "title from prdName"
  );
  assert(mapped.brand === "GAF", "brand from prdBrand facet");
  assert(
    mapped.imageUrl === "https://static-ng.becn.digital/images/large/656431_default_hero.jpg",
    "imageUrl uses imageCdnBase + image_url"
  );
  assert(
    mapped.productUrl === "https://www.qxo.com/productDetail/C-635001?skuId=656431",
    "productUrl uses siteOrigin + url"
  );
  assert(mapped.classification === "PRODUCT_PAGE", "classification is PRODUCT_PAGE");
  assert(mapped.source === "QXO", "source is QXO");
  assert(mapped.supplierId === "cmn90dbjr000404ldzhcsquav", "supplierId preserved");
}

const missingUrl = mapConstructorResult({
  result: { data: { prdName: "No URL" } },
  supplierId: "cmn90dbjr000404ldzhcsquav",
  source: "QXO",
  config,
});
assert(missingUrl === null, "returns null when product URL missing");

console.log("\nAll mapConstructorResult tests passed.\n");
