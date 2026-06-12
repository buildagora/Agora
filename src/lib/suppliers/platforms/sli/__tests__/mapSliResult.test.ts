import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSliSearchHtml, mapSliProduct } from "../mapSliResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const html = readFileSync(join(__dirname, "fixtures", "johnstone-row.html"), "utf8");
const siteOrigin = "https://www.johnstonesupply.com";

console.log("\nmapSliResult tests\n");

const parsed = parseSliSearchHtml(html, siteOrigin);
assert(parsed.length === 1, "parses one SLI product row");
assert(parsed[0].title === "Cloth Duct Tape", "title from srp-displayname");
assert(parsed[0].brand === "Shurtape", "brand from srp-brand");
assert(
  parsed[0].productUrl === "https://www.johnstonesupply.com/product-view?pID=G89-876",
  "productUrl resolves relative href"
);
assert(
  parsed[0].imageUrl ===
    "https://www.johnstonesupply.com/rest/renderImage?imageName=WEB/10090/G89-875cl.jpg&width=120&height=120",
  "imageUrl extracted when src precedes class on img tag"
);

const mapped = mapSliProduct({
  product: parsed[0],
  supplierId: "johnstone_hsv",
  source: "JOHNSTONE",
});
assert(mapped.classification === "PRODUCT_PAGE", "classification is PRODUCT_PAGE");
assert(mapped.source === "JOHNSTONE", "source preserved");

console.log("\nAll mapSliResult tests passed.\n");
