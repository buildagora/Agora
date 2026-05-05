import { getSerpApiKey } from "@/lib/config/env";
import type { SupplierProductResult } from "./types";

export async function searchLowes(query: string): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const results = (data.shopping_results || []).slice(0, 6);

    const lowesStores = [
      "lowes_south_hsv",
      "lowes_hsv",
      "lowes_north_hsv",
      "lowes_madison_hsv",
      "lowes_madison",
    ];

    const mapped: SupplierProductResult[] = [];

    for (const item of results) {
      for (const supplierId of lowesStores) {
        mapped.push({
          supplierId,
          title: item.title || q,
          brand: item.brand || null,
          imageUrl: item.thumbnail || item.serpapi_thumbnail || null,
          price: item.price || null,
          availability: "Available online / check store",
          productUrl: item.link || item.product_link || item.serpapi_immersive_product_api || null,
          source: "LOWES",
        });
      }
    }

    return mapped;
  } catch (err) {
    console.error("SerpApi Lowe's search failed:", err);
    return [];
  }
}
