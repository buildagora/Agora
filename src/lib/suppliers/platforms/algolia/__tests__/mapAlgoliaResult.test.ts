import { mapAlgoliaResult } from "../mapAlgoliaResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const config = {
  appId: "AR91I5G1KF",
  apiKey: "test-key",
  indexName: "production__products__default",
  siteOrigin: "https://www.flooranddecor.com",
  numResults: 6,
};

console.log("\nmapAlgoliaResult tests\n");

const genericHit = mapAlgoliaResult({
  hit: {
    name: "Marble Look Porcelain Tile",
    brand: "Daltile",
    url: "/product/marble-tile-123",
    image_url: "https://cdn.example.com/tile.jpg",
    price: 2.49,
  },
  supplierId: "floor_and_decor_hsv",
  source: "GENERIC",
  config,
});

assert(genericHit != null, "maps a generic Algolia hit");
if (genericHit) {
  assert(genericHit.price === "2.49", "numeric price stringified");
}

const floorAndDecorHit = mapAlgoliaResult({
  hit: {
    id: "101317733",
    objectID: "101317733",
    name: "Luxe Sand Matte Porcelain Tile",
    brand: "Vetta Elements",
    url: "/porcelain-tile/luxe-sand-matte-porcelain-tile-101317733.html",
    price: { USD: 2.99 },
    images: [
      {
        url: "//i8.amplience.net/i/flooranddecor/101317733_luxe-sand-matte-porcelain-tile_display?fmt=auto",
      },
    ],
  },
  supplierId: "floor_and_decor_hsv",
  source: "GENERIC",
  config,
});

assert(floorAndDecorHit != null, "maps a live Floor & Decor hit shape");
if (floorAndDecorHit) {
  assert(floorAndDecorHit.title === "Luxe Sand Matte Porcelain Tile", "title from hit.name");
  assert(floorAndDecorHit.brand === "Vetta Elements", "brand preserved");
  assert(floorAndDecorHit.price === "2.99", "price from price.USD object");
  assert(
    floorAndDecorHit.productUrl ===
      "https://www.flooranddecor.com/porcelain-tile/luxe-sand-matte-porcelain-tile-101317733.html",
    "productUrl uses siteOrigin + hit.url"
  );
  assert(
    floorAndDecorHit.imageUrl?.startsWith("https://i8.amplience.net/") === true,
    "imageUrl resolves protocol-relative images[0].url"
  );
  assert(floorAndDecorHit.classification === "PRODUCT_PAGE", "classification is PRODUCT_PAGE");
}

console.log("\nAll mapAlgoliaResult tests passed.\n");
