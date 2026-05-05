import { getSerpApiKey } from "@/lib/config/env";
import type { SupplierProductResult } from "./types";

type ShoppingResultItem = {
  title?: string;
  brand?: string | null;
  thumbnail?: string;
  serpapi_thumbnail?: string;
  images?: Array<{ thumbnail?: string; original?: string }>;
  link?: string;
  product_link?: string;
  serpapi_immersive_product_api?: string;
  price?: string;
};

function scoreShoppingItem(item: ShoppingResultItem, query: string): number {
  const title = String(item.title || "").toLowerCase();
  const queryLower = query.toLowerCase();
  const tokens = queryLower.split(/\s+/).filter(Boolean);

  let score = 0;

  if (title.includes(queryLower)) score += 50;

  for (const token of tokens) {
    if (title.includes(token)) score += 8;
  }

  const importantTerms = [
    "owens",
    "corning",
    "oakridge",
    "onyx",
    "black",
    "duration",
    "architectural",
    "shingles",
    "shingle",
    "metal",
    "roofing",
    "ridge",
    "vent",
  ];

  for (const term of importantTerms) {
    if (queryLower.includes(term) && title.includes(term)) score += 15;
  }

  const wrongBrands = ["atlas", "gaf", "certainteed", "tamko", "iko"];
  const wantsOwens =
    queryLower.includes("owens") ||
    queryLower.includes("corning") ||
    queryLower.includes("oakridge");

  if (wantsOwens) {
    for (const brand of wrongBrands) {
      if (title.includes(brand)) score -= 40;
    }
  }

  return score;
}

export async function searchGulfeagle(query: string): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();
  const biased = `${q} Gulfeagle Supply`;
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(biased)}&api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const results = ((data.shopping_results || []) as ShoppingResultItem[])
      .map((item) => ({ item, score: scoreShoppingItem(item, q) }))
      .sort((a, b) => b.score - a.score)
      .map((row) => row.item)
      .slice(0, 6);

    const mapped: SupplierProductResult[] = [];

    for (const item of results) {
      mapped.push({
        supplierId: "gulfeagle_hsv",
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
        source: "GULFEAGLE",
      });
    }

    return mapped;
  } catch (err) {
    console.error("SerpApi Gulfeagle Supply search failed:", err);
    return [];
  }
}
