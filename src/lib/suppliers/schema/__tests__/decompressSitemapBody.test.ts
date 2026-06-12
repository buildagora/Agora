import { gzipSync } from "node:zlib";
import {
  decompressSitemapBody,
  isGzipSitemapUrl,
} from "../decompressSitemapBody";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\ndecompressSitemapBody tests\n");

const plainXml =
  '<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url></urlset>';
assert(
  decompressSitemapBody(Buffer.from(plainXml, "utf8"), "https://example.com/s.xml") ===
    plainXml,
  "plain xml passthrough"
);

const gzBody = gzipSync(Buffer.from(plainXml, "utf8"));
assert(
  decompressSitemapBody(gzBody, "https://example.com/sitemap-1.xml.gz") === plainXml,
  "gzip urlset decompressed by .gz extension"
);
assert(
  decompressSitemapBody(gzBody, "https://example.com/sitemap-1.xml") === plainXml,
  "gzip body decompressed by magic bytes"
);
assert(
  decompressSitemapBody(gzBody, "https://example.com/sitemap-1.xml", "gzip") ===
    plainXml,
  "gzip body decompressed by content-encoding"
);

assert(
  decompressSitemapBody(Buffer.from("not gzip"), "https://example.com/bad.xml.gz") ===
    "",
  "malformed gzip returns empty string"
);

assert(isGzipSitemapUrl("https://x.com/a.xml.gz"), "isGzipSitemapUrl true for .xml.gz");
assert(!isGzipSitemapUrl("https://x.com/a.xml"), "isGzipSitemapUrl false for plain xml");

console.log("\nAll decompressSitemapBody tests passed.\n");
