/**
 * Phase 11.8 — Final launch validation.
 * Run: npx tsx scripts/validation/storefront-phase11.8-launch.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { getPrisma } from "@/lib/db.server";
import { fetchStorefrontCatalogPage } from "@/lib/search/storefront/fetchStorefrontCatalogPage.server";
import { STOREFRONT_INITIAL_PAGE_SIZE } from "@/lib/search/storefront/storefrontCatalogConstants";

const BASE = process.env.STOREFRONT_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const OUT = join(process.cwd(), "scripts/output/validation/phase11.8");

async function findRequestForSupplier(supplierId: string): Promise<string | null> {
  const p = getPrisma();
  const rec = await p.materialRequestRecipient.findFirst({
    where: { supplierId },
    select: { materialRequestId: true },
    orderBy: { sentAt: "desc" },
  });
  if (rec) {
    await p.$disconnect();
    return rec.materialRequestId;
  }
  const req = await p.materialRequest.findFirst({
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  await p.$disconnect();
  return req?.id ?? null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const issues: string[] = [];
  const passes: string[] = [];

  // --- Catalog counts ---
  for (const [sid, q] of [
    ["home_depot_hsv", "drill"],
    ["lowes_hsv", "drill"],
  ] as const) {
    const r = await fetchStorefrontCatalogPage({
      supplierId: sid,
      productSearchQuery: q,
      page: 1,
      pageSize: STOREFRONT_INITIAL_PAGE_SIZE,
      logLabel: sid,
    });
    const ok = r.products.length === STOREFRONT_INITIAL_PAGE_SIZE && r.pagination.hasMore;
    if (ok) {
      passes.push(`${sid} catalog p1=${r.products.length} hasMore=${r.pagination.hasMore}`);
    } else {
      issues.push(`${sid} catalog p1=${r.products.length} hasMore=${r.pagination.hasMore} (expected 12 + hasMore)`);
    }
  }

  const hdRequestId = await findRequestForSupplier("home_depot_hsv");
  const lowesRequestId = await findRequestForSupplier("lowes_hsv");
  const fdRequestId = await findRequestForSupplier("floor_decor_hsv");

  if (!hdRequestId) issues.push("No material request found for HD browser test");
  if (!lowesRequestId) issues.push("No material request found for Lowe's browser test");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const { sid, reqId, label } of [
    { sid: "home_depot_hsv", reqId: hdRequestId, label: "Home Depot" },
    { sid: "lowes_hsv", reqId: lowesRequestId, label: "Lowe's" },
  ]) {
    if (!reqId) continue;
    const url = `${BASE}/request/${reqId}/supplier/${sid}`;
    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    const is404 = (await page.locator("text=404").count()) > 0;
    const products = await page.locator('article:has(a:has-text("View details"))').count();
    const callLinks = await page
      .locator('a[href^="tel:"]:visible')
      .filter({ hasText: "Call supplier" })
      .count();
    if (is404) issues.push(`${label} page 404`);
    else if (products < 1) issues.push(`${label} page loads but 0 products`);
    else {
      passes.push(`${label} page OK products=${products}`);
      if (callLinks > 1) issues.push(`${label} duplicate Call CTAs: ${callLinks}`);
      else passes.push(`${label} Call CTAs=${callLinks}`);
    }
  }

  // --- Load More browser test (Floor & Decor or HD) ---
  const loadMoreReq = fdRequestId ?? hdRequestId;
  const loadMoreSupplier = fdRequestId ? "floor_decor_hsv" : "home_depot_hsv";
  const loadMoreQuery = fdRequestId ? "porcelain tile" : "drill";

  if (loadMoreReq) {
    const apiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/storefront/catalog")) apiCalls.push(req.url());
    });

    const url = `${BASE}/request/${loadMoreReq}/supplier/${loadMoreSupplier}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    await page.waitForSelector("h1", { timeout: 60_000 });

    const initial = await page.locator('article:has(a:has-text("View details"))').count();
    const btn = page.locator('button:has-text("Load more")');
    const visible = (await btn.count()) > 0;

    if (!visible) {
      issues.push(`Load More button not visible (${loadMoreSupplier}, initial=${initial})`);
    } else {
      const page2Promise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/storefront/catalog") &&
          res.url().includes("page=2") &&
          res.status() === 200,
        { timeout: 60_000 }
      );
      await btn.click();
      await page2Promise.catch(() => null);
      await page
        .locator('article:has(a:has-text("View details"))')
        .nth(initial)
        .waitFor({ state: "visible", timeout: 60_000 })
        .catch(() => null);
      const after = await page.locator('article:has(a:has-text("View details"))').count();
      const page2 = apiCalls.some((u) => u.includes("page=2"));
      const appended = after > initial;

      if (!page2) issues.push("Load More did not call catalog API page=2");
      else passes.push("Load More called /api/storefront/catalog?page=2");

      if (!appended) issues.push(`Load More did not append products (${initial} → ${after})`);
      else passes.push(`Load More appended products (${initial} → ${after})`);
    }

    // Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url, { waitUntil: "load" });
    passes.push("Load More supplier mobile page loads");
  } else {
    issues.push("No request for Load More browser test");
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    initialPageSize: STOREFRONT_INITIAL_PAGE_SIZE,
    passes,
    issues,
    recommendation: issues.length === 0 ? "GO" : issues.length <= 2 ? "CONDITIONAL_GO" : "NO_GO",
  };

  writeFileSync(join(OUT, "launch-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== Phase 11.8 Launch Validation ===\n");
  console.log("PASS:", passes.length);
  passes.forEach((p) => console.log("  ✓", p));
  console.log("\nISSUES:", issues.length);
  issues.forEach((i) => console.log("  ✗", i));
  console.log(`\nRecommendation: ${report.recommendation}\n`);
  console.log(`Report: ${join(OUT, "launch-report.json")}\n`);

  if (report.recommendation === "NO_GO") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
