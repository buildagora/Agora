import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasProductJsonLd,
  jsonLdContainsProduct,
  parseRobotsSitemapUrls,
  parseSitemapLocUrls,
  pickProductCandidateUrls,
  isSitemapIndex,
} from "../probeSchemaSitemap.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const fixturesDir = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

console.log("\nprobeSchemaSitemap tests\n");

const robots = readFixture("robots-with-sitemap.txt");
const sitemapUrls = parseRobotsSitemapUrls(robots);
assert(sitemapUrls.length === 2, "robots sitemap discovery");
assert(
  sitemapUrls[0] === "https://www.example.com/sitemap_index.xml",
  "robots first sitemap URL"
);

const fallbackUrls = parseRobotsSitemapUrls("User-agent: *\nDisallow:");
assert(fallbackUrls.length === 0, "robots without sitemap returns empty");

const urlset = readFixture("sitemap-urlset.xml");
const locs = parseSitemapLocUrls(urlset);
assert(locs.length === 3, "sitemap urlset loc count");
assert(isSitemapIndex(readFixture("sitemap-index.xml")), "sitemap index detected");
assert(!isSitemapIndex(urlset), "urlset is not index");

const productPage = readFixture("product-jsonld.html");
assert(hasProductJsonLd(productPage), "Product JSON-LD detection");
assert(
  jsonLdContainsProduct({ "@type": "Product", name: "Test" }),
  "jsonLdContainsProduct direct Product"
);
assert(
  jsonLdContainsProduct({
    "@graph": [{ "@type": "WebPage" }, { "@type": "Product", name: "Tile" }],
  }),
  "jsonLdContainsProduct @graph Product"
);

const noSchema = readFixture("homepage-no-schema.html");
assert(!hasProductJsonLd(noSchema), "no schema found on plain homepage");

const candidates = pickProductCandidateUrls([
  "https://example.com/category/roofing",
  "https://example.com/product/shingle-123",
  "https://example.com/blog/news",
]);
assert(
  candidates[0] === "https://example.com/product/shingle-123",
  "product candidate ranked first"
);

console.log("\nAll probeSchemaSitemap tests passed.\n");
