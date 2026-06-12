import type { SupplierCatalogPageResult } from "../../supplierCatalogPageOptions";
import type { SupplierProductResult } from "../../types";
import {
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
} from "@/lib/search/storefront/storefrontCatalogConstants";
import { mapConstructorResult } from "./mapConstructorResult";
import type {
  ConstructorSearchParams,
  ConstructorSearchResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://ac.cnstrc.com";

function buildConstructorSearchUrl(
  query: string,
  config: ConstructorSearchParams["constructor"],
  page: number,
  pageSize: number
): string {
  const base = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const params = new URLSearchParams({
    key: config.apiKey,
    num_results_per_page: String(pageSize),
    page: String(page),
  });
  return `${base}/v1/search/${encodeURIComponent(query)}?${params.toString()}`;
}

export async function searchConstructorCatalogPaged(
  params: ConstructorSearchParams
): Promise<SupplierCatalogPageResult> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) {
    return { products: [], totalCount: null, hasMore: false };
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    params.pageSize ?? params.constructor.numResultsPerPage ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );
  const url = buildConstructorSearchUrl(q, params.constructor, page, pageSize);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Agora/1.0 (+supplier-discovery)",
      },
    });

    if (!res.ok) {
      console.warn(`Constructor search failed for ${params.logLabel}: HTTP ${res.status}`);
      return { products: [], totalCount: null, hasMore: false };
    }

    const data = (await res.json()) as ConstructorSearchResponse;
    const results = data.response?.results ?? [];
    const mapped: SupplierProductResult[] = [];

    for (const result of results) {
      for (const supplierId of params.supplierIds) {
        const row = mapConstructorResult({
          result,
          supplierId,
          source: params.source,
          config: params.constructor,
        });
        if (row) mapped.push(row);
      }
    }

    return {
      products: mapped,
      totalCount: null,
      hasMore: mapped.length >= pageSize,
    };
  } catch (err) {
    console.warn(
      `Constructor search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { products: [], totalCount: null, hasMore: false };
  }
}

export async function searchConstructorCatalog(
  params: ConstructorSearchParams
): Promise<SupplierProductResult[]> {
  const paged = await searchConstructorCatalogPaged(params);
  return paged.products;
}
