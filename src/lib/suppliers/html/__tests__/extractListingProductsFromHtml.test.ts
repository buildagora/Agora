import { extractListingProductsFromHtml } from "../extractListingProductsFromHtml";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const pageUrl =
  "https://esc-supply.com/catalog/access-control-systems/access-cameras/doorbell-cameras/";

const html = `
<div class="col-xs-12 col-sm-4 no-margin product-item-holder hover">
    <div class="product-item">
        <div class="image">
            <a href="/products/ADCVDB105X"> <img src="/product.img?cono=013&id=648838&width=300&height=300" title="Slim Line 2 WiFi Doorbell Camera, Silver" width="120px" height="120px"/> </a>
        </div>
        <div class="body">
            <div class="title">
                <p style="font-weight: bold;">ADCVDB105X</p> <a href="/products/ADCVDB105X">Slim Line 2 WiFi Doorbell Camera, Silver</a>
            </div>
        </div>
    </div>
</div>
<div class="col-xs-12 col-sm-4 no-margin product-item-holder hover">
    <div class="product-item">
        <div class="image">
            <a href="/products/ABC123"> <img src="/product.img?cono=013&id=999&width=300&height=300" title="Sample Camera" width="120px" height="120px"/> </a>
        </div>
        <div class="body">
            <div class="title"><a href="/products/ABC123">Sample Camera</a></div>
        </div>
    </div>
</div>
`;

const products = extractListingProductsFromHtml(html, pageUrl);

assert(products.length === 2, "extracts two ESC listing cards");
assert(
  products[0]?.productUrl === "https://esc-supply.com/products/ADCVDB105X",
  "resolves absolute product URL"
);
assert(
  Boolean(products[0]?.imageUrl?.includes("/product.img?")),
  "keeps supplier-owned image URL"
);
assert(
  products[0]?.title.includes("Doorbell Camera"),
  "uses anchor title text"
);

console.log("\nAll extractListingProductsFromHtml tests passed.\n");
