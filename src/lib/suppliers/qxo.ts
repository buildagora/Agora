import { getSerpApiKey } from "@/lib/config/env";
import { rankShoppingResults } from "@/lib/search/shopping/rankShoppingResults";
import type { ShoppingResultItem } from "@/lib/search/shopping/types";
import type { SupplierProductResult } from "./types";

const QXO_SUPPLIER_ID = "cmn90dbjr000404ldzhcsquav";

export async function searchQxo(query: string): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();
  const biased = `${q} QXO Beacon Building Products`;
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(biased)}&api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const results = rankShoppingResults(
      (data.shopping_results || []) as ShoppingResultItem[],
      q,
    ).slice(0, 6);

    const mapped: SupplierProductResult[] = [];

    for (const result of results) {
      const item = result.item;
      mapped.push({
        supplierId: QXO_SUPPLIER_ID,
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
        productUrl: item.link || item.product_link || item.serpapi_immersive_product_api || null,
        source: "QXO",
        score: result.score,
        rankingSignals: result.rankingSignals,
      });
    }

    return mapped;
  } catch (err) {
    console.error("SerpApi QXO search failed:", err);
    return [];
  }
}
