import type { Page } from "playwright";
import type { PilotProductResult } from "../types";

const SITE_ORIGIN = "https://www.cityelectricsupply.com";

function resolveAbsoluteUrl(raw: string, base: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("javascript:")) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed.split("?")[0];
  try {
    return new URL(trimmed, base).href.split("?")[0];
  } catch {
    return "";
  }
}

function isProductPageUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    if (pathname === "/" || pathname.includes("/search")) return false;
    if (/\/product\//i.test(pathname)) return true;
    if (/\/p\//i.test(pathname)) return true;
    if (/\/item\//i.test(pathname)) return true;
    // CES often uses /en/.../slug or numeric product paths
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    return segments.length >= 2 && /\d/.test(last) && last.length > 4;
  } catch {
    return false;
  }
}

export async function dismissCityElectricOverlays(page: Page): Promise<void> {
  const dismissSelectors = [
    'button:has-text("Continue")',
    'button:has-text("Continue Shopping")',
    'button:has-text("Close")',
    '[aria-label="Close"]',
    ".modal-close",
    ".close-button",
  ];

  for (const selector of dismissSelectors) {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
  }
}

export async function navigateCityElectricSearch(
  page: Page,
  query: string
): Promise<string> {
  await page.goto(SITE_ORIGIN, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissCityElectricOverlays(page);

  const searchUrl = `${SITE_ORIGIN}/search?q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  await dismissCityElectricOverlays(page);

  try {
    await page.waitForSelector(
      'a[href*="/product"], a[href*="/p/"], a[href*="/item/"], [class*="search-result"], [data-product-id]',
      { timeout: 45000 }
    );
  } catch {
    // Fall through to header search attempt below.
  }

  // Fallback: use header search if direct URL did not render PLP.
  const productLinkCount = await page
    .locator('a[href*="/product"], a[href*="/p/"], a[href*="/item/"]')
    .count();
  if (productLinkCount < 3) {
    const searchInput = page
      .locator(
        'input[type="search"], input[name="q"], input[name="query"], input[placeholder*="Search" i], input[aria-label*="Search" i]'
      )
      .first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill(query);
      await searchInput.press("Enter");
      await page.waitForTimeout(4000);
      await dismissCityElectricOverlays(page);
    }
  }

  return page.url();
}

export async function extractCityElectricProducts(
  page: Page,
  query: string
): Promise<PilotProductResult[]> {
  const products: PilotProductResult[] = [];
  const seen = new Set<string>();

  const linkLocator = page.locator(
    'a[href*="/product"], a[href*="/p/"], a[href*="/item/"]'
  );
  const count = await linkLocator.count();

  for (let i = 0; i < count && products.length < 6; i++) {
    const link = linkLocator.nth(i);
    const href = (await link.getAttribute("href")) ?? "";
    const productUrl = resolveAbsoluteUrl(href, SITE_ORIGIN);
    if (!productUrl || !isProductPageUrl(productUrl) || seen.has(productUrl)) continue;

    const title =
      (await link.innerText().catch(() => "")).trim() ||
      (await link.getAttribute("title"))?.trim() ||
      (await link.locator("xpath=ancestor::article[1]//h2 | ancestor::li[1]//h2 | ancestor::div[1]//h3").first().innerText().catch(() => "")).trim();

    if (!title || title.length < 3) continue;

    const imgLocator = link.locator("xpath=ancestor::article[1]//img | ancestor::li[1]//img | ancestor::div[1]//img").first();
    const imgSrc =
      (await imgLocator.getAttribute("src").catch(() => null)) ||
      (await imgLocator.getAttribute("data-src").catch(() => null));
    const imageUrl = imgSrc ? resolveAbsoluteUrl(imgSrc, SITE_ORIGIN) : null;
    if (!imageUrl) continue;

    seen.add(productUrl);
    products.push({
      supplier: "City Electric Supply",
      query,
      title,
      brand: null,
      price: null,
      imageUrl,
      productUrl,
      classification: "PRODUCT_PAGE",
    });
  }

  return products;
}

export async function detectCloudflareChallenge(page: Page): Promise<{
  blocked: boolean;
  kind: "none" | "challenge" | "hard_block";
}> {
  const title = (await page.title()).toLowerCase();
  const body = await page.content();
  if (/sorry, you have been blocked|unable to access/i.test(body)) {
    return { blocked: true, kind: "hard_block" };
  }
  if (
    title.includes("just a moment") ||
    title.includes("attention required") ||
    /cf-browser-verification|challenge-platform|turnstile/i.test(body)
  ) {
    return { blocked: true, kind: "challenge" };
  }
  return { blocked: false, kind: "none" };
}
