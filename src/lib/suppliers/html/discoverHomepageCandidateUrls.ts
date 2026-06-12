import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import { isProductDiscoveryUrl } from "../schema/sitemapParse";
import {
  fetchHtmlScrapeUrl,
  type HtmlScrapeFetchDeps,
} from "./fetchHtmlScrape.server";

export const HOMEPAGE_LINK_LIMIT = 50;

const HOMEPAGE_LINK_RE =
  /\/products?(?:\/|$)|\/catalog|WebServices\/Catalog|\/shop(?:\/|$)/i;

export type DiscoverHomepageCandidateUrlsInput = {
  domain: string;
};

export type DiscoverHomepageCandidateUrlsDeps = HtmlScrapeFetchDeps;

function isSameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const normalizedDomain = domain.replace("www.", "");
    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}

function isExcludedByResultType(resultType: SearchResultType): boolean {
  return (
    resultType === "BLOG_PAGE" ||
    resultType === "DOCUMENTATION_PAGE" ||
    resultType === "UNKNOWN"
  );
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^www\./, "");
}

function homepageOrigins(domain: string): string[] {
  const normalized = normalizeDomain(domain);
  return [`https://www.${normalized}`, `https://${normalized}`];
}

function resolveHref(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:")
  ) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractHomepageCandidateLinks(
  html: string,
  pageUrl: string,
  domain: string
): string[] {
  const urls: string[] = [];
  const hrefRe = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRe.exec(html)) !== null) {
    const resolved = resolveHref(match[1], pageUrl);
    if (!resolved || !isSameDomain(resolved, domain)) continue;
    if (!HOMEPAGE_LINK_RE.test(resolved)) continue;

    const resultType = classifyUrl(resolved);
    if (isExcludedByResultType(resultType)) continue;
    if (!isProductDiscoveryUrl(resolved)) continue;

    urls.push(resolved);
    if (urls.length >= HOMEPAGE_LINK_LIMIT) break;
  }

  return [...new Set(urls)];
}

export async function discoverHomepageCandidateUrls(
  input: DiscoverHomepageCandidateUrlsInput,
  deps?: DiscoverHomepageCandidateUrlsDeps
): Promise<string[]> {
  for (const origin of homepageOrigins(input.domain)) {
    const response = await fetchHtmlScrapeUrl(origin, deps);
    if (response.status !== 200 || !response.html.trim()) continue;

    const links = extractHomepageCandidateLinks(
      response.html,
      response.url || origin,
      input.domain
    );
    if (links.length > 0) {
      return links;
    }
  }

  return [];
}
