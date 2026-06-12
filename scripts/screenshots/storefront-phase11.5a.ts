/**
 * Phase 11.5A image polish validation screenshots.
 * Run: npx tsx scripts/screenshots/storefront-phase11.5a.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.STOREFRONT_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const OUT_DIR = join(process.cwd(), "scripts/output/screenshots/phase11.5a");

const SUPPLIERS = [
  { label: "home-depot-ready", tier: "READY", supplierId: "home_depot_hsv", requestId: "cmpfz2bdv000o1nwvsjmzn3qk" },
  { label: "lowes-ready", tier: "READY", supplierId: "lowes_hsv", requestId: "cmpfz2bdv000o1nwvsjmzn3qk" },
  { label: "ferguson-ready", tier: "READY", supplierId: "ferguson_plumbing_hsv", requestId: "cmpfz2bdv000o1nwvsjmzn3qk" },
  { label: "floor-decor-ready", tier: "READY", supplierId: "floor_decor_hsv", requestId: "cmq0zthej0003lvwvsdqauxzy" },
  { label: "abc-ready", tier: "READY", supplierId: "abc_supply_hsv", requestId: "cmpdseo9v0002kj70y8jmzp3l" },
  { label: "tractor-partial", tier: "PARTIAL", supplierId: "tractor_supply_madison", requestId: "cmq9lp8zo00lwlvwvryepd6u4" },
  { label: "gulfeagle-partial", tier: "PARTIAL", supplierId: "gulfeagle_hsv", requestId: "cmpdsf58s000kkj70zdlg5t3g" },
  { label: "lansing-partial", tier: "PARTIAL", supplierId: "lansing_hsv", requestId: "cmpe40j530018kmwvcd83v9v2" },
  { label: "grainger-capability", tier: "CAPABILITY", supplierId: "grainger_hsv", requestId: "cmpftic32001n0cwvcdfns5pl" },
  { label: "lansing-capability", tier: "CAPABILITY", supplierId: "lansing_hsv", requestId: "cmpe40j530018kmwvcd83v9v2" },
  { label: "imperial-fence-capability", tier: "CAPABILITY", supplierId: "imperial_fence_supply", requestId: "cmq9lp5up00lnlvwvgyjkugdx" },
];

async function capture(page: Page, name: string, url: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "load", timeout: 180_000 });
  await page.waitForSelector("h1", { timeout: 180_000 });
  await page.waitForTimeout(3000);
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log("saved", path);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    for (const { supplierId, requestId, label, tier } of SUPPLIERS) {
      const url = `${BASE}/request/${requestId}/supplier/${supplierId}`;
      await capture(page, `${label}-desktop`, url, { width: 1440, height: 900 });
      await capture(page, `${label}-mobile`, url, { width: 390, height: 844 });
      console.log(`  ${label}: tier=${tier}`);
    }
  } finally {
    await browser?.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
