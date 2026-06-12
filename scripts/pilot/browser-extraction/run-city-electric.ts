/**
 * City Electric Supply — bounded browser extraction pilot (local only).
 *
 * Run: npx tsx scripts/pilot/browser-extraction/run-city-electric.ts
 * Optional: --query wire --headed (default headed true)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  detectCloudflareChallenge,
  extractCityElectricProducts,
  navigateCityElectricSearch,
} from "./extractors/cityElectric";
import type { CityElectricPilotReport, PilotProductResult } from "./types";

const OUTPUT_DIR = join(__dirname, "output");
const ARTIFACT_DIR = join(__dirname, "artifacts");

function parseArgs(argv: string[]) {
  const queryIdx = argv.indexOf("--query");
  const query = queryIdx >= 0 ? argv[queryIdx + 1] : "wire";
  const headed = !argv.includes("--headless");
  return { query: query ?? "wire", headed };
}

async function main() {
  const { query, headed } = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const errors: string[] = [];
  let products: PilotProductResult[] = [];
  let finalUrl = "";
  let cloudflareBypassed = false;
  let navigationMs = 0;
  let extractionMs = 0;
  let screenshotPath: string | undefined;
  let htmlSnapshotPath: string | undefined;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: !headed,
    channel: headed ? "chrome" : undefined,
  }).catch(async () =>
    chromium.launch({
      headless: !headed,
    })
  );

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();

    const navStart = Date.now();
    finalUrl = await navigateCityElectricSearch(page, query);
    navigationMs = Date.now() - navStart;

    const cf = await detectCloudflareChallenge(page);
    cloudflareBypassed = !cf.blocked;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    screenshotPath = join(ARTIFACT_DIR, `city-electric-${timestamp}.png`);
    htmlSnapshotPath = join(ARTIFACT_DIR, `city-electric-${timestamp}.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch((err) => {
      errors.push(`screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    writeFileSync(htmlSnapshotPath, await page.content(), "utf8");

    const extractStart = Date.now();
    products = await extractCityElectricProducts(page, query);
    extractionMs = Date.now() - extractStart;

    if (products.length === 0) {
      errors.push("No products extracted — check artifacts HTML/screenshot for DOM structure.");
    }
    if (cf.blocked) {
      errors.push(
        cf.kind === "hard_block"
          ? "Cloudflare hard block page detected (Sorry, you have been blocked)."
          : "Cloudflare challenge page detected after navigation."
      );
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  const pass =
    products.length >= 6 &&
    products.every(
      (p) =>
        p.title &&
        p.imageUrl &&
        p.productUrl &&
        p.classification === "PRODUCT_PAGE"
    ) &&
    !errors.some((e) => e.toLowerCase().includes("cloudflare"));

  const report: CityElectricPilotReport = {
    pilotVersion: "0.1",
    supplier: "City Electric Supply",
    supplierId: "city_electric_hsv",
    domain: "cityelectricsupply.com",
    query,
    mode: "headed-playwright",
    runAt: new Date().toISOString(),
    pass,
    cloudflareBypassed,
    manualValidationNotes:
      "Phase 0: headed Playwright run from local environment. Anonymous session; no login or dealer portal.",
    productCount: products.length,
    products,
    finalUrl,
    errors,
    timingsMs: {
      total: Date.now() - started,
      navigation: navigationMs,
      extraction: extractionMs,
    },
    artifacts: {
      screenshotPath,
      htmlSnapshotPath,
    },
  };

  const outPath = join(OUTPUT_DIR, `city-electric-pilot-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWrote report: ${outPath}`);
  if (screenshotPath) console.error(`Screenshot: ${screenshotPath}`);

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
