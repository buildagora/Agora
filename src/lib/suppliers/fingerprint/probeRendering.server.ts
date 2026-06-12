import type { AntiBotRisk, RenderingType } from "@prisma/client";
import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import {
  fetchProbeUrl,
  type ProbeFetchDeps,
  type ProbeRequestBudget,
} from "./probeHttp.server";
import type { RenderingProbeFacts } from "./types";

const LOGIN_WALL_RE =
  /sign in to (view|see|access|shop)|customer login|dealer login|login required|create an account to shop/i;

const CLOUDFLARE_BLOCK_RE =
  /sorry,? you have been blocked|access denied.*cloudflare|cf-error-details/i;

const CLOUDFLARE_CHALLENGE_RE =
  /cf-browser-verification|challenge-platform|just a moment|checking your browser before accessing/i;

const CAPTCHA_WIDGET_RE =
  /g-recaptcha|hcaptcha|recaptcha|cf-turnstile|captcha/i;

const CAPTCHA_CHALLENGE_RE =
  /verify you are human|complete the captcha|captcha challenge|security check required|please complete the security check|unusual traffic from your computer network/i;

const SPA_SHELL_RE =
  /<div[^>]+id=["'](root|app|__next|main-app)["']/i;

const SPA_FRAMEWORK_RE =
  /__NEXT_DATA__|window\.__NUXT__|ng-version|data-reactroot|vite\/client/i;

export type RenderingProbeResult = RenderingProbeFacts & {
  probeNotes: string[];
};

function visibleTextLength(html: string): number {
  return stripScriptsAndStyles(html).length;
}

/** True when captcha is blocking access, not merely embedded as a form widget. */
export function isCaptchaBlockPage(
  html: string,
  productCardHints = 0
): boolean {
  if (CAPTCHA_CHALLENGE_RE.test(html)) return true;
  if (!CAPTCHA_WIDGET_RE.test(html)) return false;
  if (productCardHints > 0) return false;
  return visibleTextLength(html) < 500;
}

export function detectAntiBotRisk(input: {
  status: number | null;
  html: string;
  productCardHints?: number;
}): AntiBotRisk {
  const { status, html, productCardHints = 0 } = input;

  if (status === 403) return "HARD_BLOCK";
  if (CLOUDFLARE_BLOCK_RE.test(html)) return "HARD_BLOCK";

  if (status === 429) return "HIGH";
  if (CLOUDFLARE_CHALLENGE_RE.test(html)) return "HIGH";
  if (isCaptchaBlockPage(html, productCardHints)) return "HIGH";

  if (LOGIN_WALL_RE.test(html) && productCardHints === 0) return "MEDIUM";

  if (status != null && status >= 400) return "HIGH";
  if (!html.trim()) return "UNKNOWN";

  return "LOW";
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countProductLinks(html: string): number {
  const hrefRe = /href=["']([^"']+)["']/gi;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    try {
      const type = classifyUrl(
        href.startsWith("http") ? href : `https://example.com${href.startsWith("/") ? href : `/${href}`}`
      );
      if (
        type === "PRODUCT_PAGE" ||
        type === "CATEGORY_PAGE" ||
        type === "SEARCH_PAGE"
      ) {
        count += 1;
      }
    } catch {
      continue;
    }
  }
  return count;
}

function countScriptTags(html: string): number {
  return (html.match(/<script\b/gi) ?? []).length;
}

export function analyzeRendering(html: string): {
  renderingType: RenderingType;
  isSPA: boolean;
} {
  const visibleText = stripScriptsAndStyles(html);
  const textLength = visibleText.length;
  const productLinks = countProductLinks(html);
  const scriptTags = countScriptTags(html);
  const hasSpaShell = SPA_SHELL_RE.test(html);
  const hasSpaFramework = SPA_FRAMEWORK_RE.test(html);

  const sparseBody = textLength < 400;
  const spaSignals =
    hasSpaShell || hasSpaFramework || (sparseBody && scriptTags >= 4);

  if (spaSignals && productLinks >= 3 && textLength >= 150) {
    return { renderingType: "HYBRID", isSPA: true };
  }

  if (spaSignals && productLinks < 2 && textLength < 900) {
    return { renderingType: "SPA", isSPA: true };
  }

  if (textLength >= 400 || productLinks >= 2) {
    return { renderingType: "SERVER_RENDERED", isSPA: false };
  }

  if (spaSignals) {
    return { renderingType: "SPA", isSPA: true };
  }

  return { renderingType: "UNKNOWN", isSPA: false };
}

function countProductCardHints(html: string): number {
  return (
    html.match(
      /product-tile|product-card|productTile|data-product-id|product-view\?pID|sli-product-row/gi
    ) ?? []
  ).length;
}

function siteOrigins(domain: string): string[] {
  const normalized = domain.replace(/^www\./, "").trim();
  return [`https://www.${normalized}`, `https://${normalized}`];
}

function searchUrls(origin: string): string[] {
  return [
    `${origin}/search?q=test`,
    `${origin}/catalogsearch/result/?q=test`,
  ];
}

export async function probeRendering(
  domain: string,
  deps?: ProbeFetchDeps & { budget?: ProbeRequestBudget }
): Promise<RenderingProbeResult> {
  const notes: string[] = [];
  const budget = deps?.budget;

  let homepageStatus: number | null = null;
  let homepageHtml = "";
  let originUsed: string | null = null;

  for (const origin of siteOrigins(domain)) {
    if (budget && !budget.consume()) {
      notes.push("budget_exhausted_before_homepage");
      break;
    }
    const res = await fetchProbeUrl(`${origin}/`, deps);
    if (res.status != null && res.html.length > 100) {
      homepageStatus = res.status;
      homepageHtml = res.html;
      originUsed = origin;
      break;
    }
  }

  if (!homepageHtml) {
    return {
      renderingType: "UNKNOWN",
      isSPA: null,
      antiBotRisk: "UNKNOWN",
      probeNotes: ["homepage_fetch_failed"],
    };
  }

  let searchHtml = "";
  let searchStatus: number | null = null;
  if (originUsed && (!budget || budget.canFetch())) {
    if (!budget || budget.consume()) {
      for (const searchUrl of searchUrls(originUsed)) {
        const res = await fetchProbeUrl(searchUrl, deps);
        if (res.status != null && res.html.length > 500) {
          searchHtml = res.html;
          searchStatus = res.status;
          notes.push(`search_probe:${searchUrl}`);
          break;
        }
      }
    }
  }

  const analysisHtml = searchHtml || homepageHtml;
  const productCardHints = countProductCardHints(analysisHtml);
  const worstStatus =
    searchStatus != null && homepageStatus != null
      ? Math.max(searchStatus, homepageStatus)
      : (searchStatus ?? homepageStatus);

  const antiBotRisk = detectAntiBotRisk({
    status: worstStatus,
    html: analysisHtml,
    productCardHints,
  });

  if (antiBotRisk === "HARD_BLOCK" || antiBotRisk === "HIGH") {
    notes.push(`antibot:${antiBotRisk}`);
    return {
      renderingType: "UNKNOWN",
      isSPA: null,
      antiBotRisk,
      probeNotes: notes,
    };
  }

  const rendering = analyzeRendering(analysisHtml);
  notes.push(`rendering:${rendering.renderingType}`);

  return {
    ...rendering,
    antiBotRisk,
    probeNotes: notes,
  };
}
