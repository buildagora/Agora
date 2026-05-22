import { getSerpApiKey } from "@/lib/config/env";
import { rankShoppingResults } from "@/lib/search/shopping/rankShoppingResults";
import type { ShoppingResultItem } from "@/lib/search/shopping/types";
import { cachedSerpFetch } from "@/lib/serpCache/server";
import type { SupplierProductResult } from "./types";

const LOWES_STORES = [
  "lowes_south_hsv",
  "lowes_hsv",
  "lowes_north_hsv",
  "lowes_madison_hsv",
  "lowes_madison",
] as const;

function isBlockedProductUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("serpapi.com") ||
    lower.includes("google.com") ||
    lower.includes("googleusercontent.com") ||
    lower.includes("goo.gl") ||
    lower.includes("google_shopping")
  );
}

/** True when URL is a Lowe's product detail page. */
function isLowesPdpUrl(url: string): boolean {
  if (!url.trim() || isBlockedProductUrl(url)) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith("lowes.com")) return false;
    return parsed.pathname.toLowerCase().includes("/pd/");
  } catch {
    return false;
  }
}

function buildLowesSearchUrl(searchTerm: string): string {
  const term = searchTerm.trim() || "supplies";
  return `https://www.lowes.com/search?searchTerm=${encodeURIComponent(term)}`;
}

type ResolvedLowesUrl = {
  url: string;
  usedFallback: boolean;
  hadCandidateLinks: boolean;
};

function resolveLowesUrl(
  item: ShoppingResultItem,
  query: string,
): ResolvedLowesUrl {
  const candidates = [item.link, item.product_link, (item as { url?: string }).url].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );

  const hadCandidateLinks = candidates.length > 0;

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (isLowesPdpUrl(trimmed)) {
      return { url: trimmed, usedFallback: false, hadCandidateLinks };
    }
  }

  const searchTerm = item.title?.trim() || query;
  return {
    url: buildLowesSearchUrl(searchTerm),
    usedFallback: true,
    hadCandidateLinks,
  };
}

export async function searchLowes(query: string): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${apiKey}`;

  try {
    const res = await cachedSerpFetch(url);
    const data = await res.json();

    const rawItems = (data.shopping_results || []) as ShoppingResultItem[];
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      console.warn("SerpApi Lowe's: no shopping_results in response", {
        query: q,
        keys: Object.keys(data as object),
      });
      return [];
    }

    const results = rankShoppingResults(rawItems, q).slice(0, 6);

    const mapped: SupplierProductResult[] = [];

    for (const result of results) {
      const item = result.item;
      const { url: resolvedLowesUrl, usedFallback, hadCandidateLinks } = resolveLowesUrl(
        item,
        q,
      );

      if (isBlockedProductUrl(resolvedLowesUrl)) {
        console.warn("SerpApi Lowe's: blocked URL after resolve; using search fallback", {
          query: q,
          title: item.title,
          url: resolvedLowesUrl,
        });
        continue;
      }

      if (usedFallback) {
        if (hadCandidateLinks) {
          console.warn("SerpApi Lowe's: no valid PDP; using search fallback", {
            query: q,
            title: item.title,
            link: item.link,
            product_link: item.product_link,
          });
        }
      }

      for (const supplierId of LOWES_STORES) {
        mapped.push({
          supplierId,
          title: item.title || q,
          brand: item.brand || null,
          imageUrl:
            item.thumbnail ||
            item.serpapi_thumbnail ||
            item.images?.[0]?.thumbnail ||
            item.images?.[0]?.original ||
            null,
          price: item.price || null,
          availability: "Available online / check store",
          productUrl: resolvedLowesUrl,
          source: "LOWES",
          score: result.score,
          rankingSignals: result.rankingSignals,
        });
      }
    }

    return mapped;
  } catch (err) {
    console.error("SerpApi Lowe's search failed:", err);
    return [];
  }
}
