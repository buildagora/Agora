/**
 * classifyUrl unit tests (Wave 2A).
 * Run: npm run test:classify-url
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyUrl } from "../classifyUrl";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function assertAccepted(url: string, expected: "PRODUCT_PAGE" | "CATEGORY_PAGE") {
  const result = classifyUrl(url);
  assert(
    result === expected,
    `${url} → ${result} (expected ${expected})`
  );
}

function assertRejected(url: string) {
  const result = classifyUrl(url);
  assert(
    result === "UNKNOWN" || result === "BLOG_PAGE" || result === "DOCUMENTATION_PAGE",
    `${url} → ${result} (expected rejection)`
  );
}

console.log("\nclassifyUrl Wave 2A tests\n");

assertAccepted(
  "https://www.electronicfasteners.com/screws/",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://www.farrellcalhoun.com/our-products",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://www.farrellcalhoun.com/our-products/farrell+products/480-line-int-flat-wall-paint",
  "PRODUCT_PAGE"
);
assertAccepted(
  "https://www.parkerindustrialsupply.com/our-products/screws",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://generalshale.com/product-category/concrete-block/",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://henleysupply.com/products/doors/",
  "PRODUCT_PAGE"
);
assertAccepted(
  "https://pinnaclesurface.com/products",
  "PRODUCT_PAGE"
);
assertAccepted(
  "https://pinnaclesurface.com/Dolomaite",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://www.servicesteelinc.com/steel-products",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://spectraguttersystems.com/catalog",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://summertownmetals.com/building-materials/metal-roofing-siding/",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://parksupplycompany.com/product-category/plumbing-parts-repair/pipe-fittings/page/2/",
  "CATEGORY_PAGE"
);
assertAccepted(
  "https://www.fsiusa.com/structural-screws--2",
  "PRODUCT_PAGE"
);

assertRejected("https://www.ewingoutdoorsupply.com/blog/tag/texas-landscaping-supplier");
assertRejected("https://henleysupply.com/news/why-investing-in-quality-exterior-doors-adds-value-to-your-home/");
assertRejected("https://ampinc.net/contact/");
assertRejected("https://lwsupply.com/locations/lw-supply-san-antonio-tx/");
assertRejected("https://www.servicesteelinc.com/about-us");
assertRejected("https://example.com/privacy-policy");
assertRejected("https://example.com/terms-of-use");
assertRejected("https://summertownmetals.com/faq/");
assertRejected("https://www.electronicfasteners.com/technical/glossary/");

const phase96Path = join(
  process.cwd(),
  "scripts/output/fingerprint/phase9.6-wave2-strategy-2026-06-10T14-54-05-629Z.json"
);
const phase96 = JSON.parse(readFileSync(phase96Path, "utf8")) as {
  task1_imageFailureInventory: Array<{
    supplierId: string;
    urlDiagnostics: Array<{ url: string; failureStage: string }>;
  }>;
};

let replayAccepted = 0;
let replayStillExcluded = 0;
for (const supplier of phase96.task1_imageFailureInventory) {
  for (const diag of supplier.urlDiagnostics) {
    if (diag.failureStage !== "url_excluded_by_classification") continue;
    const result = classifyUrl(diag.url);
    const excluded =
      result === "UNKNOWN" ||
      result === "BLOG_PAGE" ||
      result === "DOCUMENTATION_PAGE";
    if (excluded) replayStillExcluded += 1;
    else replayAccepted += 1;
  }
}
assert(
  replayAccepted >= 15,
  `Phase 9.6 classification replay accepted ${replayAccepted} formerly-excluded URLs`
);
console.log(
  `INFO: Phase 9.6 replay — ${replayAccepted} accepted, ${replayStillExcluded} still excluded (blog/junk by design)`
);

console.log("\nAll classifyUrl tests passed.\n");
