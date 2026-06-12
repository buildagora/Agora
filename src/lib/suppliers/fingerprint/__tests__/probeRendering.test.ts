import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeRendering,
  detectAntiBotRisk,
} from "../probeRendering.server";
import {
  isFingerprintProbeCohortSupplier,
  mergeLiveProbeFacts,
  shouldRunFingerprintProbe,
} from "../types";
import { buildFactsFromLegacy } from "../buildFactsFromLegacy";

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

console.log("\nprobeRendering tests\n");

const serverRendered = readFixture("server-rendered.html");
const serverAnalysis = analyzeRendering(serverRendered);
assert(
  serverAnalysis.renderingType === "SERVER_RENDERED",
  "SERVER_RENDERED fixture"
);
assert(serverAnalysis.isSPA === false, "SERVER_RENDERED isSPA false");

const spa = readFixture("spa-shell.html");
const spaAnalysis = analyzeRendering(spa);
assert(spaAnalysis.renderingType === "SPA", "SPA fixture");
assert(spaAnalysis.isSPA === true, "SPA isSPA true");

const hybrid = readFixture("hybrid-page.html");
const hybridAnalysis = analyzeRendering(hybrid);
assert(hybridAnalysis.renderingType === "HYBRID", "HYBRID fixture");
assert(hybridAnalysis.isSPA === true, "HYBRID isSPA true");

assert(
  detectAntiBotRisk({
    status: 200,
    html: readFixture("cloudflare-block.html"),
  }) === "HARD_BLOCK",
  "Cloudflare block → HARD_BLOCK"
);

assert(
  detectAntiBotRisk({ status: 403, html: "Forbidden" }) === "HARD_BLOCK",
  "403 → HARD_BLOCK"
);

assert(
  detectAntiBotRisk({
    status: 200,
    html: readFixture("server-rendered.html"),
    productCardHints: 6,
  }) === "LOW",
  "normal page → LOW"
);

const captchaWidgetLargePage = `<!DOCTYPE html><html><head><title>HVAC Parts | Wittichen Supply</title></head><body>
<h1>HVAC Parts</h1>${"<p>Product category listing with many items.</p>".repeat(80)}
<script src="https://www.google.com/recaptcha/api.js"></script></body></html>`;
assert(
  detectAntiBotRisk({ status: 200, html: captchaWidgetLargePage }) === "LOW",
  "embedded captcha widget on large page → LOW"
);
assert(
  detectAntiBotRisk({
    status: 200,
    html: "<html><body><div class=\"g-recaptcha\"></div><p>Verify</p></body></html>",
  }) === "HIGH",
  "small captcha-only page → HIGH"
);
assert(
  detectAntiBotRisk({
    status: 200,
    html: "<html><body><h1>Verify you are human</h1><div class=\"g-recaptcha\"></div></body></html>",
  }) === "HIGH",
  "captcha challenge copy → HIGH"
);

assert(
  isFingerprintProbeCohortSupplier("abc_supply_hsv"),
  "abc_supply in probe cohort"
);
assert(
  isFingerprintProbeCohortSupplier("lansing_atl"),
  "lansing in probe cohort"
);
assert(
  !isFingerprintProbeCohortSupplier("ferguson_wdc"),
  "ferguson not in probe cohort"
);

const baseFacts = buildFactsFromLegacy({
  supplier: { id: "abc_supply_hsv", domain: "abcsupply.com" },
});
const merged = mergeLiveProbeFacts(baseFacts, {
  hasSchemaMarkup: true,
  hasSitemap: true,
  sitemapUrls: ["https://www.abcsupply.com/sitemap.xml"],
  renderingType: "SERVER_RENDERED",
  isSPA: false,
  antiBotRisk: "LOW",
});
assert(merged.hasSchemaMarkup === true, "mergeLiveProbeFacts sets hasSchemaMarkup");
assert(merged.renderingType === "SERVER_RENDERED", "mergeLiveProbeFacts sets renderingType");
assert(merged.antiBotRisk === "LOW", "mergeLiveProbeFacts sets antiBotRisk");

assert(
  !shouldRunFingerprintProbe({
    probeEnabled: false,
    supplierId: "abc_supply_hsv",
  }),
  "probe disabled → no probe"
);
assert(
  shouldRunFingerprintProbe({
    probeEnabled: true,
    supplierId: "abc_supply_hsv",
    explicitSupplierId: "abc_supply_hsv",
  }),
  "probe enabled with explicit supplier-id"
);
assert(
  !shouldRunFingerprintProbe({
    probeEnabled: true,
    supplierId: "ferguson_wdc",
  }),
  "probe enabled without explicit id skips non-cohort"
);
assert(
  shouldRunFingerprintProbe({
    probeEnabled: true,
    supplierId: "gulfeagle_hsv",
  }),
  "probe enabled for cohort supplier without explicit id"
);

console.log("\nAll probeRendering tests passed.\n");
