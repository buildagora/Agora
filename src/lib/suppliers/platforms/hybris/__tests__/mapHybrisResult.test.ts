import {
  mapHybrisProduct,
  parseLennoxHybrisHtml,
  parseSiteoneHybrisHtml,
} from "../mapHybrisResult";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nmapHybrisResult tests\n");

const siteoneHtml = `
<div class="product-item col-xs-12" data-product-id="658262">
  <input type="hidden" value="Dyed Brown Mulch Bulk Sold Per Cu Yd" id="checkbranch-productname-658262"/>
  <input type="hidden" value="https://media.siteone.com/images/mulch.jpg" id="checkbranch-imgurl-658262"/>
  <input type="hidden" class="plpProductBrand_658262" value="SiteOne"/>
  <input class="quoteUom-Price" type="hidden" value='35.63'/>
  <a class="thumb" href="/en/dyed-brown-mulch-bulk-sold-per-cu-yd/p/658262">Mulch</a>
</div>
`;

const siteoneProducts = parseSiteoneHybrisHtml(siteoneHtml, "https://www.siteone.com");
assert(siteoneProducts.length === 1, "SiteOne parser finds one product card");
const siteone = siteoneProducts[0];
assert(siteone.title.includes("Mulch"), "SiteOne title extracted");
assert(siteone.brand === "SiteOne", "SiteOne brand extracted");
assert(
  siteone.imageUrl === "https://media.siteone.com/images/mulch.jpg",
  "SiteOne imageUrl extracted when value precedes id"
);
assert(siteone.price === "35.63", "SiteOne price extracted");
assert(
  siteone.productUrl === "https://www.siteone.com/en/dyed-brown-mulch-bulk-sold-per-cu-yd/p/658262",
  "SiteOne productUrl resolved"
);

const siteoneMapped = mapHybrisProduct({
  product: siteone,
  supplierId: "siteone_hsv",
  source: "GENERIC",
});
assert(siteoneMapped.classification === "PRODUCT_PAGE", "SiteOne classification is PRODUCT_PAGE");

const lennoxHtml = `
<li class="item" data-product-id="28G70" data-prod-name="Contactor 3PDT 25A" data-product-brand="Lennox">
  <a href="/107670-01-contactor-3pdt-25a/p/28G70" class="productMainLink" data-prod-name="107670-01 CONTACTOR 3PDT 25A">
    <img src="https://assets.lennoxpros.com/images/contactor.jpg"/>
    <h2 class="title">Contactor 3PDT 25A</h2>
  </a>
</li>
`;

const lennoxProducts = parseLennoxHybrisHtml(lennoxHtml, "https://www.lennoxpros.com");
assert(lennoxProducts.length === 1, "Lennox parser finds one SKU card");
const lennox = lennoxProducts[0];
assert(lennox.title === "Contactor 3PDT 25A", "Lennox title extracted");
assert(lennox.brand === "Lennox", "Lennox brand extracted");
assert(
  lennox.productUrl === "https://www.lennoxpros.com/107670-01-contactor-3pdt-25a/p/28G70",
  "Lennox productUrl resolved"
);
assert(lennox.price === null, "Lennox price null when not in HTML");

const lennoxMapped = mapHybrisProduct({
  product: lennox,
  supplierId: "lennox_hsv",
  source: "LENNOX",
});
assert(lennoxMapped.source === "LENNOX", "Lennox source preserved");

console.log("\nAll mapHybrisResult tests passed.\n");
