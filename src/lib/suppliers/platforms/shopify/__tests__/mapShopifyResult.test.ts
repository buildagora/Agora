import { mapShopifyResult } from "../mapShopifyResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const config = {
  siteOrigin: "https://www.lumberliquidators.com",
  suggestPath: "/search/suggest.json",
  numResults: 6,
};

console.log("\nmapShopifyResult tests\n");

const mapped = mapShopifyResult({
  product: {
    title: "1.15 Gallon Hardwood, Laminate, Vinyl Floor Cleaner",
    vendor: "Bellawood",
    price: "19.99",
    image: "https://cdn.shopify.com/s/files/1/example/BELLAFC1G.jpg",
    url: "/products/1-15-gallon-hardwood-laminate-vinyl-floor-cleaner?variant=123",
  },
  supplierId: "ll_flooring_hsv",
  source: "GENERIC",
  config,
});

assert(mapped != null, "maps a live Lumber Liquidators product shape");
if (mapped) {
  assert(mapped.title.includes("Hardwood"), "title preserved");
  assert(mapped.brand === "Bellawood", "brand from vendor");
  assert(mapped.price === "19.99", "price preserved");
  assert(
    mapped.productUrl ===
      "https://www.lumberliquidators.com/products/1-15-gallon-hardwood-laminate-vinyl-floor-cleaner",
    "productUrl strips query params and resolves site origin"
  );
  assert(mapped.imageUrl?.includes("cdn.shopify.com") === true, "imageUrl preserved");
  assert(mapped.classification === "PRODUCT_PAGE", "classification is PRODUCT_PAGE");
  assert(mapped.supplierId === "ll_flooring_hsv", "supplierId preserved");
}

const handleOnly = mapShopifyResult({
  product: {
    title: "Sample Floor",
    handle: "sample-floor",
    vendor: "LL Flooring",
  },
  supplierId: "ll_flooring_hsv",
  source: "GENERIC",
  config,
});

assert(handleOnly?.productUrl === "https://www.lumberliquidators.com/products/sample-floor", "handle fallback URL");

console.log("\nAll mapShopifyResult tests passed.\n");
