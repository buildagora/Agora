/**
 * Phase 11.6 — Final storefront production QA.
 * Run: npx tsx scripts/validation/storefront-phase11.6-qa.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { getPrisma } from "@/lib/db.server";
import { fetchStorefrontCatalogPage } from "@/lib/search/storefront/fetchStorefrontCatalogPage.server";
import { lookupBrandLogo } from "@/lib/search/storefront/brandLogoRegistry";
import { lookupStorefrontTier } from "@/lib/search/storefront/resolveStorefrontTier";
import { STOREFRONT_INITIAL_PAGE_SIZE } from "@/lib/search/storefront/storefrontCatalogConstants";

const BASE = process.env.STOREFRONT_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const OUT_DIR = join(process.cwd(), "scripts/output/validation/phase11.6");
const SHOT_DIR = join(process.cwd(), "scripts/output/screenshots/phase11.6");

type SupplierCase = {
  label: string;
  supplierId: string;
  requestId: string;
  query: string;
  expectedTier: "READY" | "PARTIAL" | "CAPABILITY";
};

const CASES: Omit<SupplierCase, "requestId">[] = [
  { label: "Home Depot", supplierId: "home_depot_hsv", query: "drill", expectedTier: "READY" },
  { label: "Lowe's", supplierId: "lowes_hsv", query: "drill", expectedTier: "READY" },
  { label: "Ferguson", supplierId: "ferguson_plumbing_hsv", query: "ball valve", expectedTier: "READY" },
  { label: "Floor & Decor", supplierId: "floor_decor_hsv", query: "porcelain tile", expectedTier: "READY" },
  { label: "ABC Supply", supplierId: "abc_supply_hsv", query: "shingles", expectedTier: "READY" },
  { label: "Tractor Supply", supplierId: "tractor_supply_madison", query: "fencing", expectedTier: "PARTIAL" },
  { label: "Gulfeagle", supplierId: "gulfeagle_hsv", query: "shingles", expectedTier: "PARTIAL" },
  { label: "Lansing", supplierId: "lansing_hsv", query: "shingles", expectedTier: "CAPABILITY" },
  { label: "Grainger", supplierId: "grainger_hsv", query: "plumbing valve", expectedTier: "CAPABILITY" },
  { label: "Imperial Fence", supplierId: "imperial_fence_supply", query: "fencing", expectedTier: "CAPABILITY" },
];

type UiCheck = {
  label: string;
  supplierId: string;
  expectedTier: string;
  actualTier: string;
  pageLoads: boolean;
  is404: boolean;
  hasH1: boolean;
  callHref: string | null;
  directionsHref: string | null;
  callInHeader: boolean;
  callOnCards: number;
  hasSidebarOrFilters: boolean;
  productCards: number;
  browseTiles: number;
  loadMoreVisible: boolean;
  loadMoreWorks: boolean | null;
  showingText: string | null;
  desktopShot: string;
  mobileShot: string;
  issues: string[];
};

type CatalogCheck = {
  label: string;
  page1: number;
  page2: number;
  hasMore: boolean;
  issues: string[];
};

async function resolveRequestIds(): Promise<SupplierCase[]> {
  const p = getPrisma();
  const out: SupplierCase[] = [];
  for (const c of CASES) {
    const rec = await p.materialRequestRecipient.findFirst({
      where: { supplierId: c.supplierId },
      select: { materialRequestId: true },
    });
    out.push({
      ...c,
      requestId: rec?.materialRequestId ?? "MISSING",
    });
  }
  await p.$disconnect();
  return out;
}

async function auditPage(page: Page, c: SupplierCase): Promise<UiCheck> {
  const issues: string[] = [];
  const url = `${BASE}/request/${c.requestId}/supplier/${c.supplierId}`;
  const slug = c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  await page.setViewportSize({ width: 1440, height: 900 });
  const resp = await page.goto(url, { waitUntil: "load", timeout: 180_000 });
  const is404 = resp?.status() === 404 || (await page.locator("text=404").count()) > 0;
  const pageLoads = !is404 && resp?.ok() === true;

  if (c.requestId === "MISSING") issues.push("No materialRequestRecipient in DB");
  if (is404) issues.push("Page returned 404");

  let hasH1 = false;
  let callHref: string | null = null;
  let directionsHref: string | null = null;
  let callInHeader = false;
  let callOnCards = 0;
  let hasSidebarOrFilters = false;
  let productCards = 0;
  let browseTiles = 0;
  let loadMoreVisible = false;
  let loadMoreWorks: boolean | null = null;
  let showingText: string | null = null;

  if (pageLoads) {
    await page.waitForSelector("h1", { timeout: 60_000 }).catch(() => {});
    hasH1 = (await page.locator("h1").count()) > 0;

    const header = page.locator("section").first();
    callHref = await page.locator('a[href^="tel:"]').first().getAttribute("href").catch(() => null);
    directionsHref = await page
      .locator('a[href*="google.com/maps"], a[href*="maps.google"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    callInHeader = (await header.locator('a[href^="tel:"]').count()) > 0;

    const allCallLinks = await page.locator('a[href^="tel:"]').count();
    callOnCards = Math.max(0, allCallLinks - (callInHeader ? 1 : 0));
    if (callOnCards > 0) issues.push(`Duplicate Call CTAs on page: ${callOnCards} outside header`);

    hasSidebarOrFilters =
      (await page.locator("text=Categories").count()) > 0 ||
      (await page.locator('button:has-text("Filters")').count()) > 0;

    productCards = await page.locator('article:has(a:has-text("View details"))').count();
    browseTiles = await page.locator('a:has-text("Filter by brand"), a:has-text("Filter by category"), a:has-text("View evidence")').count();

    showingText = await page.locator("text=/Showing \\d+/").first().textContent().catch(() => null);
    loadMoreVisible = (await page.locator('button:has-text("Load more")').count()) > 0;

    if (loadMoreVisible) {
      const before = productCards;
      await page.locator('button:has-text("Load more")').click();
      await page.waitForTimeout(4000);
      const after = await page.locator('article:has(a:has-text("View details"))').count();
      loadMoreWorks = after > before;
      if (!loadMoreWorks) issues.push("Load more did not increase product count");
      productCards = after;
    }

    const actualTier = lookupStorefrontTier(c.supplierId);
    if (actualTier !== c.expectedTier) {
      issues.push(`Tier mismatch: expected ${c.expectedTier}, got ${actualTier}`);
    }

    if (c.expectedTier === "READY" && productCards === 0 && !loadMoreVisible) {
      issues.push("READY supplier shows 0 product cards");
    }
    if (c.expectedTier === "CAPABILITY" && browseTiles === 0 && productCards === 0) {
      issues.push("CAPABILITY supplier has no browse tiles and no products");
    }
    if (!hasSidebarOrFilters && browseTiles === 0 && productCards === 0) {
      issues.push("Empty sidebar and empty main content");
    }
  }

  mkdirSync(SHOT_DIR, { recursive: true });
  const desktopShot = join(SHOT_DIR, `${slug}-desktop.png`);
  const mobileShot = join(SHOT_DIR, `${slug}-mobile.png`);
  if (pageLoads) {
    await page.screenshot({ path: desktopShot, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: mobileShot, fullPage: true });
  }

  return {
    label: c.label,
    supplierId: c.supplierId,
    expectedTier: c.expectedTier,
    actualTier: lookupStorefrontTier(c.supplierId),
    pageLoads,
    is404,
    hasH1,
    callHref,
    directionsHref,
    callInHeader,
    callOnCards,
    hasSidebarOrFilters,
    productCards,
    browseTiles,
    loadMoreVisible,
    loadMoreWorks,
    showingText,
    desktopShot,
    mobileShot,
    issues,
  };
}

async function auditCatalog(c: SupplierCase): Promise<CatalogCheck> {
  const issues: string[] = [];
  if (c.requestId === "MISSING") {
    return { label: c.label, page1: 0, page2: 0, hasMore: false, issues: ["No DB recipient"] };
  }
  try {
    const page1 = await fetchStorefrontCatalogPage({
      supplierId: c.supplierId,
      productSearchQuery: c.query,
      page: 1,
      pageSize: STOREFRONT_INITIAL_PAGE_SIZE,
      logLabel: c.label,
    });
    let page2 = 0;
    if (page1.pagination.hasMore) {
      const p2 = await fetchStorefrontCatalogPage({
        supplierId: c.supplierId,
        productSearchQuery: c.query,
        page: 2,
        pageSize: STOREFRONT_INITIAL_PAGE_SIZE,
        logLabel: c.label,
      });
      page2 = p2.products.length;
      if (page2 === 0) issues.push("Page 2 empty despite hasMore=true");
    }
    if (c.expectedTier === "READY" && page1.products.length === 0) {
      issues.push("Catalog API returned 0 products for READY supplier");
    }
    return {
      label: c.label,
      page1: page1.products.length,
      page2,
      hasMore: page1.pagination.hasMore,
      issues,
    };
  } catch (err) {
    issues.push(err instanceof Error ? err.message : String(err));
    return { label: c.label, page1: 0, page2: 0, hasMore: false, issues };
  }
}

function checkWrongLogos(): string[] {
  const badPairs = [
    ["Hilti", "milwaukee"],
    ["Paslode", "milwaukee"],
    ["Makita", "milwaukee"],
    ["Bosch", "milwaukee"],
  ];
  const issues: string[] = [];
  for (const [brand, wrongSlug] of badPairs) {
    const logo = lookupBrandLogo(brand);
    if (logo?.slug === wrongSlug) issues.push(`${brand} still maps to ${wrongSlug}`);
  }
  return issues;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cases = await resolveRequestIds();
  const logoIssues = checkWrongLogos();

  console.log("\n=== Phase 11.6 Final Storefront QA ===\n");

  const catalogChecks: CatalogCheck[] = [];
  for (const c of cases) {
    process.stdout.write(`Catalog ${c.label}… `);
    const check = await auditCatalog(c);
    catalogChecks.push(check);
    console.log(`p1=${check.page1} p2=${check.page2} hasMore=${check.hasMore}`);
  }

  let browser: Browser | null = null;
  const uiChecks: UiCheck[] = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    for (const c of cases) {
      process.stdout.write(`UI ${c.label}… `);
      const check = await auditPage(page, c);
      uiChecks.push(check);
      console.log(check.issues.length ? `ISSUES: ${check.issues.join("; ")}` : "OK");
    }
  } finally {
    await browser?.close();
  }

  const allIssues = [
    ...logoIssues,
    ...catalogChecks.flatMap((c) => c.issues.map((i) => `[catalog:${c.label}] ${i}`)),
    ...uiChecks.flatMap((c) => c.issues.map((i) => `[ui:${c.label}] ${i}`)),
  ];

  const blockers = allIssues.filter(
    (i) =>
      i.includes("404") ||
      i.includes("Duplicate Call") ||
      i.includes("wrong") ||
      i.includes("maps to milwaukee") ||
      i.includes("Load more did not") ||
      i.includes("READY supplier shows 0") ||
      i.includes("Catalog API returned 0 products for READY")
  );

  const report = {
    generatedAt: new Date().toISOString(),
    catalogChecks,
    uiChecks,
    logoIssues,
    allIssues,
    blockers,
    recommendation: blockers.length === 0 ? "GO" : blockers.length <= 2 ? "CONDITIONAL_GO" : "NO_GO",
  };

  writeFileSync(join(OUT_DIR, "qa-report.json"), JSON.stringify(report, null, 2));

  const md = [
    "# Phase 11.6 Final Storefront QA",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Recommendation: **" + report.recommendation + "**",
    "",
    blockers.length
      ? "### Blockers\n" + blockers.map((b) => `- ${b}`).join("\n")
      : "### Blockers\nNone",
    "",
    "## Catalog (server)",
    "",
    "| Supplier | Page 1 | Page 2 | Has More | Issues |",
    "|----------|--------|--------|----------|--------|",
    ...catalogChecks.map(
      (c) =>
        `| ${c.label} | ${c.page1} | ${c.page2} | ${c.hasMore} | ${c.issues.join("; ") || "—"} |`
    ),
    "",
    "## UI (Playwright)",
    "",
    "| Supplier | Tier | Products | Browse | Sidebar | Call header | Dup CTAs | Load more | Issues |",
    "|----------|------|----------|--------|---------|-------------|----------|-----------|--------|",
    ...uiChecks.map(
      (c) =>
        `| ${c.label} | ${c.actualTier} | ${c.productCards} | ${c.browseTiles} | ${c.hasSidebarOrFilters ? "yes" : "no"} | ${c.callInHeader ? "yes" : "no"} | ${c.callOnCards} | ${c.loadMoreWorks ?? "n/a"} | ${c.issues.join("; ") || "—"} |`
    ),
    "",
    "## Screenshots",
    "",
    `Saved to \`scripts/output/screenshots/phase11.6/\``,
    "",
    "## Logo alias audit",
    "",
    logoIssues.length ? logoIssues.map((i) => `- ${i}`).join("\n") : "No wrong logo aliases detected.",
  ].join("\n");

  writeFileSync(join(OUT_DIR, "qa-report.md"), md);
  console.log("\n" + md);
  console.log(`\nReport: ${join(OUT_DIR, "qa-report.md")}\n`);

  if (report.recommendation === "NO_GO") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
