/**
 * Capture Phase 11.2 storefront screenshots for READY / PARTIAL / CAPABILITY tiers.
 * Run: npx tsx scripts/screenshots/storefront-phase11.2.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.STOREFRONT_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const SUPPLIERS = [
  {
    tier: "READY",
    supplierId: "ferguson_plumbing_hsv",
    requestId: "cmpfz2bdv000o1nwvsjmzn3qk",
    label: "ferguson-ready",
  },
  {
    tier: "PARTIAL",
    supplierId: "gulfeagle_hsv",
    requestId: "cmpdsf58s000kkj70zdlg5t3g",
    label: "gulfeagle-partial",
  },
  {
    tier: "CAPABILITY",
    supplierId: "grainger_hsv",
    requestId: "cmpftic32001n0cwvcdfns5pl",
    label: "grainger-capability",
  },
];

const OUT_DIR = join(process.cwd(), "scripts/output/screenshots/phase11.2");

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

    for (const { supplierId, requestId, label } of SUPPLIERS) {
      const url = `${BASE}/request/${requestId}/supplier/${supplierId}`;
      await capture(page, `${label}-desktop`, url, { width: 1440, height: 900 });
      await capture(page, `${label}-mobile`, url, { width: 390, height: 844 });
    }
  } finally {
    await browser?.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
