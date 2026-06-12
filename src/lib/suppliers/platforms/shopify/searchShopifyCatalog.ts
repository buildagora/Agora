import { mapShopifyResult } from "./mapShopifyResult";
import type { ShopifySearchParams, ShopifySuggestResponse } from "./types";

function buildShopifySuggestUrl(query: string, config: ShopifySearchParams["shopify"]): string {
  const params = new URLSearchParams({
    q: query,
    "resources[type]": "product",
    "resources[limit]": String(config.numResults),
  });
  const path = config.suggestPath.startsWith("/")
    ? config.suggestPath
    : `/${config.suggestPath}`;
  return `${config.siteOrigin}${path}?${params.toString()}`;
}

export async function searchShopifyCatalog(
  params: ShopifySearchParams
): Promise<import("../../types").SupplierProductResult[]> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) return [];

  const url = buildShopifySuggestUrl(q, params.shopify);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Agora/1.0 (+supplier-discovery)",
      },
    });

    if (!res.ok) {
      console.warn(`Shopify search failed for ${params.logLabel}: HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as ShopifySuggestResponse;
    const products = data.resources?.results?.products ?? [];
    const mapped: import("../../types").SupplierProductResult[] = [];

    for (const product of products.slice(0, params.shopify.numResults)) {
      for (const supplierId of params.supplierIds) {
        const row = mapShopifyResult({
          product,
          supplierId,
          source: params.source,
          config: params.shopify,
        });
        if (row) mapped.push(row);
      }
    }

    return mapped;
  } catch (err) {
    console.warn(
      `Shopify search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}
