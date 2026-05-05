import { getSerpApiKey } from "@/lib/config/env";

export type SupplierProductResult = {
  supplierId: string;
  title: string;
  brand?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  productUrl?: string | null;
  source: "HOME_DEPOT";
  availability?: string | null;
};

export async function searchHomeDepot(query: string): Promise<SupplierProductResult[]> {
  const q = query.trim();
  if (!q) return [];

  const apiKey = getSerpApiKey();

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const results = (data.shopping_results || []).slice(0, 6);

    const homeDepotStores = [
      "home_depot_hsv",
      "home_depot_madison",
      "home_depot_south_hsv",
      "home_depot_north_hsv",
      "home_depot_west_hsv",
    ];

    const mapped: SupplierProductResult[] = [];

    for (const item of results) {
      for (const supplierId of homeDepotStores) {
        mapped.push({
          supplierId,
          title: item.title || q,
          brand: item.brand || null,
          imageUrl: item.thumbnail || item.serpapi_thumbnail || null,
          price: item.price || null,
          availability: "Available online / check store",
          productUrl: item.link || item.product_link || item.serpapi_immersive_product_api || null,
          source: "HOME_DEPOT",
        });
      }
    }

    return mapped;
  } catch (err) {
    console.error("SerpApi Home Depot search failed:", err);
    return [];
  }
}
