import { mapAlgoliaResult } from "./mapAlgoliaResult";
import type {
  AlgoliaSearchParams,
  AlgoliaSearchResponse,
} from "./types";
import type { SupplierCatalogPageResult } from "../../supplierCatalogPageOptions";
import {
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
} from "@/lib/search/storefront/storefrontCatalogConstants";

export async function searchAlgoliaCatalogPaged(
  params: AlgoliaSearchParams
): Promise<SupplierCatalogPageResult> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) {
    return { products: [], totalCount: null, hasMore: false };
  }

  const page = Math.max(0, (params.page ?? 1) - 1);
  const hitsPerPage = clampStorefrontPageSize(
    params.pageSize ?? params.algolia.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );

  const url = `https://${params.algolia.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(params.algolia.indexName)}/query`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": params.algolia.appId,
        "X-Algolia-API-Key": params.algolia.apiKey,
      },
      body: JSON.stringify({
        query: q,
        hitsPerPage,
        page,
      }),
    });

    if (!res.ok) {
      console.warn(`Algolia search failed for ${params.logLabel}: HTTP ${res.status}`);
      return { products: [], totalCount: null, hasMore: false };
    }

    const data = (await res.json()) as AlgoliaSearchResponse;
    const hits = data.hits ?? [];
    const mapped: import("../../types").SupplierProductResult[] = [];

    for (const hit of hits) {
      for (const supplierId of params.supplierIds) {
        const row = mapAlgoliaResult({
          hit,
          supplierId,
          source: params.source,
          config: params.algolia,
        });
        if (row) mapped.push(row);
      }
    }

    const totalCount = typeof data.nbHits === "number" ? data.nbHits : null;
    const hasMore =
      totalCount != null
        ? (page + 1) * hitsPerPage < totalCount
        : hits.length >= hitsPerPage;

    return { products: mapped, totalCount, hasMore };
  } catch (err) {
    console.warn(
      `Algolia search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { products: [], totalCount: null, hasMore: false };
  }
}

export async function searchAlgoliaCatalog(
  params: AlgoliaSearchParams
): Promise<import("../../types").SupplierProductResult[]> {
  const result = await searchAlgoliaCatalogPaged(params);
  return result.products;
}
