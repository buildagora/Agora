import { getSerpApiKey } from "@/lib/config/env";
import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import { cachedSerpFetch } from "@/lib/serpCache/server";

export type HtmlDiscoverySource = "serp" | "homepage" | "mixed";

export type HtmlCandidateDiscoveryResult = {
  urls: string[];
  serpOrganicCount: number;
  discoverySource: HtmlDiscoverySource;
};

export type DiscoverHtmlCandidateUrlsInput = {
  query: string;
  domain: string;
};

export type DiscoverHtmlCandidateUrlsDeps = {
  getApiKey?: () => string | undefined;
  serpFetchFn?: typeof cachedSerpFetch;
};

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

export async function discoverHtmlCandidateUrls(
  input: DiscoverHtmlCandidateUrlsInput,
  deps?: DiscoverHtmlCandidateUrlsDeps
): Promise<HtmlCandidateDiscoveryResult> {
  const q = input.query.trim();
  if (!q) {
    return { urls: [], serpOrganicCount: 0, discoverySource: "serp" };
  }

  const apiKey = deps?.getApiKey?.() ?? getSerpApiKey();
  if (!apiKey) {
    return { urls: [], serpOrganicCount: 0, discoverySource: "serp" };
  }

  const serpFetchFn = deps?.serpFetchFn ?? cachedSerpFetch;
  const qParam = `site:${input.domain} ${q}`;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(qParam)}&api_key=${apiKey}`;

  try {
    const res = await serpFetchFn(url);
    if (!res.ok) {
      return { urls: [], serpOrganicCount: 0, discoverySource: "serp" };
    }

    const data = (await res.json()) as {
      organic_results?: { link?: string }[];
    };
    const organicRaw = (data.organic_results || []).slice(0, 20);
    const serpOrganicCount = organicRaw.filter((item) => Boolean(item.link)).length;

    const urls: string[] = [];
    for (const item of organicRaw) {
      const link = item.link;
      if (!link || !isSameDomain(link, input.domain)) continue;
      const resultType = classifyUrl(link);
      if (isExcludedByResultType(resultType)) continue;
      urls.push(link);
    }

    return {
      urls: [...new Set(urls)],
      serpOrganicCount,
      discoverySource: "serp",
    };
  } catch {
    return { urls: [], serpOrganicCount: 0, discoverySource: "serp" };
  }
}
