import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractProductFromHtml,
  extractProductFromJsonLd,
} from "../extractProductMetadata";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const fixturesDir = join(__dirname, "fixtures");
const fingerprintFixturesDir = join(
  __dirname,
  "../../fingerprint/__tests__/fixtures"
);

function readFixture(name: string, dir = fixturesDir): string {
  return readFileSync(join(dir, name), "utf8");
}

console.log("\nextractProductMetadata tests\n");

const jsonLdPage = readFixture("product-jsonld.html", fingerprintFixturesDir);
const schema = extractProductFromJsonLd(
  jsonLdPage,
  "https://www.example.com/product/shingle-123"
);
assert(schema?.title === "Architectural Shingle", "schema success title");
assert(
  schema?.imageUrl === "https://www.example.com/images/shingle.jpg",
  "schema success image"
);

assert(schema?.productUrl.includes("example.com") === true, "schema productUrl");

const noSchema = readFixture("homepage-no-schema.html", fingerprintFixturesDir);
assert(
  extractProductFromJsonLd(noSchema, "https://www.example.com/") === null,
  "schema empty on homepage"
);

const htmlPage = readFixture("product-page-html.html");
const htmlProduct = extractProductFromHtml(
  htmlPage,
  "https://www.example.com/product/timberline-hdz"
);
assert(htmlProduct?.title === "GAF Timberline HDZ Shingle", "html title from og:title");
assert(
  htmlProduct?.imageUrl === "https://www.example.com/images/timberline-hdz.jpg",
  "html image from og:image"
);
assert(htmlProduct != null, "html extraction returns product metadata");

const entityHtml = `<html><head>
  <meta property="og:title" content="Refrigerants &amp; Tanks | Wittichen Supply" />
  </head><body><h1>Refrigerants &amp; Tanks</h1></body></html>`;
const entityProduct = extractProductFromHtml(
  entityHtml,
  "https://www.wittichen-supply.com/products/refrigerants-tanks/"
);
assert(
  entityProduct?.title === "Refrigerants & Tanks | Wittichen Supply",
  "html title decodes amp entity"
);

console.log("\nAll extractProductMetadata tests passed.\n");
