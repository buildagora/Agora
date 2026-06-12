/**
 * Phase 11.7 — Load More browser validation + big-box smoke.
 * Run: npx tsx scripts/validation/storefront-phase11.7-preprod.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { getPrisma } from "@/lib/db.server";
import { fetchStorefrontCatalogPage } from "@/lib/search/storefront/fetchStorefrontCatalogPage.server";

const BASE = process.env.STOREFRONT_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const OUT = join(process.cwd(), "scripts/output/validation/phase11.7");

const BIG_BOX = [
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
  "lowes_south_hsv",
];

async function recipientMap() {
  const p = getPrisma();
  const map: Record<string, { requestId: string; requestText: string }[]> = {};
  for (const sid of BIG_BOX) {
    const rows = await p.materialRequestRecipient.findMany({
      where: { supplierId: sid },
      select: {
        materialRequestId: true,
        materialRequest: { select: { requestText: true } },
      },
      take: 5,
    });
    map[sid] = rows.map((r) => ({
      requestId: r.materialRequestId,
      requestText: r.materialRequest?.requestText?.trim() ?? "",
    }));
  }
  await p.$disconnect();
  return map;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const recipients = await recipientMap();
  const catalog: Record<string, number> = {};
  for (const sid of ["home_depot_hsv", "lowes_hsv", "home_depot_north_hsv", "lowes_north_hsv"]) {
    const r = await fetchStorefrontCatalogPage({
      supplierId: sid,
      productSearchQuery: sid.includes("home") ? "drill" : "drill",
      page: 1,
      pageSize: 24,
      logLabel: sid,
    });
    catalog[sid] = r.products.length;
  }

  // Find load-more candidate: floor_decor with tile query, pageSize 12 in API
  const fd = await fetchStorefrontCatalogPage({
    supplierId: "floor_decor_hsv",
    productSearchQuery: "tile",
    page: 1,
    pageSize: 12,
    logLabel: "F&D",
  });

  const p = getPrisma();
  const fdRec = await p.materialRequestRecipient.findFirst({
    where: { supplierId: "floor_decor_hsv" },
    select: { materialRequestId: true },
  });
  await p.$disconnect();

  const loadMoreResult = {
    candidate: "floor_decor_hsv",
    query: "tile",
    page1Count: fd.products.length,
    hasMore: fd.pagination.hasMore,
    requestId: fdRec?.materialRequestId ?? null,
    browserTest: null as Record<string, unknown> | null,
  };

  if (fdRec && fd.pagination.hasMore) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = `${BASE}/request/${fdRec.materialRequestId}/supplier/floor_decor_hsv`;
    const apiCalls: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/api/storefront/catalog")) apiCalls.push(req.url());
    });

    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    await page.waitForSelector("h1", { timeout: 60_000 });

    const initialCount = await page.locator('article:has(a:has-text("View details"))').count();
    const loadMoreVisible = (await page.locator('button:has-text("Load more")').count()) > 0;

    let loadingState = false;
    let afterCount = initialCount;
    let page2Called = false;

    if (loadMoreVisible) {
      const btn = page.locator('button:has-text("Load more")');
      await btn.click();
      loadingState = (await page.locator('button:has-text("Loading")').count()) > 0;
      await page.waitForTimeout(5000);
      afterCount = await page.locator('article:has(a:has-text("View details"))').count();
      page2Called = apiCalls.some((u) => u.includes("page=2"));
    }

    // Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("h1");
    const mobileLoadMore = (await page.locator('button:has-text("Load more"), button:has-text("Filters")').count()) > 0;

    loadMoreResult.browserTest = {
      initialCount,
      loadMoreVisible,
      loadingState,
      afterCount,
      page2Called,
      apiCalls,
      mobileLoadMore,
      appended: afterCount > initialCount,
    };
    await browser.close();
  }

  // Big-box page test with valid recipient pairs
  const pageTests: Record<string, unknown>[] = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const sid of ["home_depot_hsv", "lowes_hsv", "home_depot_north_hsv", "lowes_north_hsv"]) {
    const recs = recipients[sid] ?? [];
    const rec = recs[0];
    if (!rec) {
      pageTests.push({ supplierId: sid, status: "NO_RECIPIENT", catalogProducts: catalog[sid] ?? 0 });
      continue;
    }
    const url = `${BASE}/request/${rec.requestId}/supplier/${sid}`;
    const resp = await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    const is404 = (await page.locator("text=404").count()) > 0;
    const products = is404 ? 0 : await page.locator('article:has(a:has-text("View details"))').count();
    const callLinks = is404 ? 0 : await page.locator('a[href^="tel:"]').count();
    pageTests.push({
      supplierId: sid,
      requestId: rec.requestId,
      status: is404 ? "404" : resp?.ok() ? "OK" : "ERROR",
      products,
      callLinks,
      catalogProducts: catalog[sid] ?? 0,
    });
  }
  await browser.close();

  const report = { recipients, catalog, loadMoreResult, pageTests };
  writeFileSync(join(OUT, "preprod-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
