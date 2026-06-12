import type { AntiBotRisk } from "@prisma/client";
import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import {
  detectAntiBotRisk,
  isCaptchaBlockPage,
} from "./probeRendering.server";

/** Fine-grained anti-bot category for attempt telemetry (not a router strategy). */
export type AntiBotCategory =
  | "CLOUDFLARE_HARD_BLOCK"
  | "CLOUDFLARE_CHALLENGE"
  | "CAPTCHA_WIDGET"
  | "CAPTCHA_CHALLENGE_PAGE"
  | "HTTP_403"
  | "HTTP_429"
  | "LOGIN_WALL"
  | "SOFT_CHALLENGE_SHELL"
  | "FETCH_FAILED"
  | "NONE";

export type BlockedUrlClass =
  | "search"
  | "product"
  | "sitemap"
  | "homepage"
  | "robots"
  | "unknown";

export type AntiBotClassification = {
  antiBotRisk: AntiBotRisk;
  antiBotCategory: AntiBotCategory;
  blockedUrlClass: BlockedUrlClass;
};

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

export function inferBlockedUrlClass(url: string): BlockedUrlClass {
  const trimmed = url.trim();
  if (!trimmed) return "unknown";

  if (/robots\.txt/i.test(trimmed)) return "robots";
  if (/sitemap/i.test(trimmed)) return "sitemap";

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.toLowerCase();
    if (path === "/" || path === "") return "homepage";
    if (
      /\/search\b|catalogsearch|[?&]q=|[?&]query=/i.test(trimmed) ||
      path.includes("/search")
    ) {
      return "search";
    }
    if (classifyUrl(trimmed) === "PRODUCT_PAGE") return "product";
  } catch {
    return "unknown";
  }

  return "unknown";
}

function resolveAntiBotCategory(input: {
  status: number | null;
  html: string;
  productCardHints?: number;
}): AntiBotCategory {
  const { status, html, productCardHints = 0 } = input;

  if (status === 403) return "HTTP_403";
  if (CLOUDFLARE_BLOCK_RE.test(html)) return "CLOUDFLARE_HARD_BLOCK";
  if (status === 429) return "HTTP_429";
  if (CLOUDFLARE_CHALLENGE_RE.test(html)) return "CLOUDFLARE_CHALLENGE";
  if (CAPTCHA_CHALLENGE_RE.test(html)) return "CAPTCHA_CHALLENGE_PAGE";
  if (isCaptchaBlockPage(html, productCardHints)) return "CAPTCHA_CHALLENGE_PAGE";
  if (CAPTCHA_WIDGET_RE.test(html) && productCardHints > 0) {
    return "CAPTCHA_WIDGET";
  }
  if (LOGIN_WALL_RE.test(html) && productCardHints === 0) return "LOGIN_WALL";
  if (!html.trim()) return "FETCH_FAILED";
  if (status != null && status >= 400) return "SOFT_CHALLENGE_SHELL";

  return "NONE";
}

/** Classify a fetch response for attempt telemetry. Does not change routing. */
export function classifyAntiBotResponse(input: {
  status: number | null;
  html: string;
  url?: string;
  productCardHints?: number;
}): AntiBotClassification {
  const antiBotRisk = detectAntiBotRisk(input);
  const antiBotCategory = resolveAntiBotCategory(input);
  const blockedUrlClass = input.url
    ? inferBlockedUrlClass(input.url)
    : "unknown";

  return { antiBotRisk, antiBotCategory, blockedUrlClass };
}
