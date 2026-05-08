import { getSerpApiKey } from "@/lib/config/env";
import { rankShoppingResults } from "@/lib/search/shopping/rankShoppingResults";
import type { ShoppingResultItem } from "@/lib/search/shopping/types";
import type { SupplierProductResult } from "./types";

export async function searchHomeDepot(query: string): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const results = rankShoppingResults(
      (data.shopping_results || []) as ShoppingResultItem[],
      q,
    ).slice(0, 6);

    const homeDepotStores = [
      "home_depot_hsv",
      "home_depot_madison",
      "home_depot_south_hsv",
      "home_depot_north_hsv",
      "home_depot_west_hsv",
    ];

    const mapped: SupplierProductResult[] = [];

    for (const result of results) {
      const item = result.item;
      for (const supplierId of homeDepotStores) {
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
          productUrl: item.link || item.product_link || item.serpapi_immersive_product_api || null,
          source: "HOME_DEPOT",
          score: result.score,
          rankingSignals: result.rankingSignals,
        });
      }
    }

    return mapped;
  } catch (err) {
    console.error("SerpApi Home Depot search failed:", err);
    return [];
  }
}
