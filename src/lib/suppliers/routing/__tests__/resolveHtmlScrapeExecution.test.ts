import {
  getHtmlScrapeUnsupportedReason,
  isHtmlScrapeExecutionAllowed,
  HTML_SCRAPE_ALLOWLIST,
  HTML_SCRAPE_WAVE1_SUPPLIERS,
} from "../resolveHtmlScrapeExecution";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log("\nresolveHtmlScrapeExecution tests\n");

assert(
  HTML_SCRAPE_ALLOWLIST.has("re_michel_hsv"),
  "allowlist includes re_michel_hsv"
);
assert(
  HTML_SCRAPE_ALLOWLIST.has("wittichen_hsv"),
  "allowlist includes wittichen_hsv"
);
for (const id of HTML_SCRAPE_WAVE1_SUPPLIERS) {
  assert(HTML_SCRAPE_ALLOWLIST.has(id), `Wave 1 allowlist includes ${id}`);
}
assert(
  HTML_SCRAPE_ALLOWLIST.size === 11,
  "allowlist size is 11 after Wave 1"
);

assert(
  isHtmlScrapeExecutionAllowed("re_michel_hsv"),
  "re_michel_hsv is allowed"
);
assert(
  isHtmlScrapeExecutionAllowed("lansing_hsv"),
  "lansing_hsv is allowed after Wave 1"
);

assert(
  getHtmlScrapeUnsupportedReason("ferguson_wdc") === "supplier_not_allowlisted",
  "non-allowlisted supplier blocked"
);

console.log("\nAll resolveHtmlScrapeExecution tests passed.\n");
