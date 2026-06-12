import {
  classifyHybrisEmptyReason,
  countHybrisParsedProductMarkers,
} from "../hybrisSearchDiagnostics";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nhybrisSearchDiagnostics tests\n");

const siteoneSearchHtml = `
<div class="product-item col-xs-12" data-product-id="658262">
  <input type="hidden" value="Dyed Brown Mulch" id="checkbranch-productname-658262"/>
  <a class="thumb" href="/en/dyed-brown-mulch/p/658262">Mulch</a>
</div>`;

assert(
  countHybrisParsedProductMarkers(siteoneSearchHtml, "siteone").productItem === 1,
  "siteone markers count product-item"
);

const lennoxPlpHtml = `
<li class="item col-sm-4" data-product-id="Y3653">
  <a href="/part/p/Y3653" class="productMainLink" data-prod-name="Twinning Kit">Part</a>
</li>`;

assert(
  countHybrisParsedProductMarkers(lennoxPlpHtml, "lennox").productMainLink === 1,
  "lennox markers count productMainLink"
);

const emptyLennoxShell = `<div class="product-grid">data-product-id="X" in script only</div>`;

assert(
  classifyHybrisEmptyReason({
    httpStatus: 200,
    requestUrl: "https://www.lennoxpros.com/search?text=furnace",
    finalUrl: "https://www.lennoxpros.com/search?text=furnace",
    html: emptyLennoxShell,
    variant: "lennox",
    parsedProductCount: 0,
    markers: countHybrisParsedProductMarkers(emptyLennoxShell, "lennox"),
  }) === "empty_plp_shell",
  "lennox empty shell classified"
);

assert(
  classifyHybrisEmptyReason({
    httpStatus: 200,
    requestUrl: "https://www.siteone.com/en/search?text=irrigation",
    finalUrl: "https://www.siteone.com/en/irrigation/c/sh14",
    html: "<html></html>",
    variant: "siteone",
    parsedProductCount: 0,
    markers: { productItem: 0, productMainLink: 0, dataProductId: 0 },
  }) === "redirect_category_page",
  "siteone category redirect classified"
);

console.log("\nAll hybrisSearchDiagnostics tests passed.\n");
