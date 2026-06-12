import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractDomProductImageCandidates,
  extractJsonLdProductImageCandidates,
  extractMetaImageCandidates,
  extractPageImageFromHtml,
  isSupplierOwnedImageUrl,
  resolveAbsolutePageUrl,
} from "../pageImageExtraction";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const pageUrl = "https://www.example.com/product/widget";

console.log("\npageImageExtraction Wave 2B tests\n");

const ogHtml = `<html><head>
  <meta content="https://cdn.example.com/images/door.jpg?v=1&amp;w=800" property="og:image" />
  <meta name="twitter:image" content="https://cdn.example.com/images/twitter.jpg" />
</head><body></body></html>`;
const ogResult = extractPageImageFromHtml(ogHtml, pageUrl);
assert(
  ogResult?.source === "og_image",
  "og:image extracted with entity decoding"
);
assert(
  ogResult?.imageUrl === "https://cdn.example.com/images/door.jpg?v=1&w=800",
  "og:image resolves to https URL"
);

const jsonLdHtml = `<html><head><script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Structural Screw",
  "image": [
    "https://www.example.com/images/screw-a.jpg",
    { "@type": "ImageObject", "url": "https://www.example.com/images/screw-b.jpg" }
  ],
  "images": ["https://www.example.com/images/screw-c.jpg"]
}
</script></head></html>`;
const jsonLdResult = extractPageImageFromHtml(jsonLdHtml, pageUrl);
assert(jsonLdResult?.source === "json_ld", "JSON-LD Product.image array extracted");
assert(
  jsonLdResult?.imageUrl === "https://www.example.com/images/screw-a.jpg",
  "JSON-LD picks first valid image"
);

const domHtml = `<html><body>
  <img src="/assets/logo.png" alt="Logo" class="site-logo" />
  <img src="/images/products/widget-800.jpg" class="product-image wp-post-image" alt="Widget" />
</body></html>`;
const domResult = extractPageImageFromHtml(domHtml, "https://www.example.com/products/widget");
assert(domResult?.source === "dom", "DOM fallback selects product image");
assert(
  domResult?.imageUrl === "https://www.example.com/images/products/widget-800.jpg",
  "DOM fallback rejects logo"
);

assert(
  extractPageImageFromHtml(
    `<html><body><img src="https://facebook.com/tr?id=1" /></body></html>`,
    pageUrl
  ) === null,
  "social tracking image rejected"
);

assert(
  isSupplierOwnedImageUrl(
    "https://www.example.com/images/a.jpg",
    "https://shop.example.com/p/1"
  ),
  "same registrable domain accepted"
);
assert(
  !isSupplierOwnedImageUrl(
    "https://evil.example.net/images/a.jpg",
    "https://shop.example.com/p/1",
    true
  ),
  "strict DOM match rejects unrelated host"
);

const metaOnly = extractMetaImageCandidates(
  `<meta property="og:image:secure_url" content="//cdn.example.com/paint.jpg" />`,
  pageUrl
);
assert(
  metaOnly[0]?.url === "https://cdn.example.com/paint.jpg",
  "og:image:secure_url protocol-relative URL resolved"
);

const domCandidates = extractDomProductImageCandidates(domHtml, "https://www.example.com/p");
assert(domCandidates.length === 1, "DOM candidate parser skips logo");

const phase96Path = join(
  process.cwd(),
  "scripts/output/fingerprint/phase9.6-wave2-strategy-2026-06-10T14-54-05-629Z.json"
);
const phase96 = JSON.parse(readFileSync(phase96Path, "utf8")) as {
  task1_imageFailureInventory: Array<{
    supplierId: string;
    urlDiagnostics: Array<{ url: string; failureStage: string; pageStatus?: number }>;
  }>;
};

const wave2bSuppliers = new Set([
  "absolute_glass",
  "associated_masonry_madison",
  "discount_metal_hsv",
  "ewing_hsv",
  "general_shale_hsv",
  "inline_electric_hsv",
  "metaltek_hsv",
  "north_aluminum",
  "parker_industrial_hsv",
  "pinnacle_surfaces",
  "southland_hsv",
  "summertown_metals_tn",
  "us_brick_madison",
]);

assert(
  extractJsonLdProductImageCandidates(jsonLdHtml, pageUrl).length >= 3,
  "JSON-LD candidate collector finds multiple images"
);
assert(
  resolveAbsolutePageUrl("/images/a.jpg", pageUrl) === "https://www.example.com/images/a.jpg",
  "relative image path resolves against page URL"
);

console.log(
  `INFO: Phase 9.6 Wave 2B supplier inventory loaded (${wave2bSuppliers.size} suppliers)`
);

console.log("\nAll pageImageExtraction tests passed.\n");
