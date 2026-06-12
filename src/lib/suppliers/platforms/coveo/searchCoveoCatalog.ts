import type { SupplierCatalogPageResult } from "../../supplierCatalogPageOptions";
import { mapCoveoResult } from "./mapCoveoResult";
import type { CoveoSearchParams, CoveoSearchResponse } from "./types";
import {
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
} from "@/lib/search/storefront/storefrontCatalogConstants";

export async function searchCoveoCatalogPaged(
  params: CoveoSearchParams
): Promise<SupplierCatalogPageResult> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) {
    return { products: [], totalCount: null, hasMore: false };
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    params.pageSize ?? params.coveo.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );
  const firstResult = (page - 1) * pageSize;

  const url = `https://platform.cloud.coveo.com/rest/search/v2?organizationId=${encodeURIComponent(params.coveo.organizationId)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.coveo.apiKey}`,
      },
      body: JSON.stringify({
        q,
        searchHub: params.coveo.searchHub,
        numberOfResults: pageSize,
        firstResult,
      }),
    });

    if (!res.ok) {
      console.warn(`Coveo search failed for ${params.logLabel}: HTTP ${res.status}`);
      return { products: [], totalCount: null, hasMore: false };
    }

    const data = (await res.json()) as CoveoSearchResponse;
    const results = data.results ?? [];
    const mapped: import("../../types").SupplierProductResult[] = [];

    for (const result of results) {
      for (const supplierId of params.supplierIds) {
        const row = mapCoveoResult({
          result,
          supplierId,
          source: params.source,
          config: params.coveo,
        });
        if (row) mapped.push(row);
      }
    }

    const totalCount =
      typeof data.totalCount === "number" ? data.totalCount : null;

    return {
      products: mapped,
      totalCount,
      hasMore:
        totalCount != null
          ? firstResult + mapped.length < totalCount
          : mapped.length >= pageSize,
    };
  } catch (err) {
    console.warn(
      `Coveo search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { products: [], totalCount: null, hasMore: false };
  }
}

export async function searchCoveoCatalog(
  params: CoveoSearchParams
): Promise<import("../../types").SupplierProductResult[]> {
  const paged = await searchCoveoCatalogPaged(params);
  return paged.products;
}
