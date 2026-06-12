import type { SupplierCatalogPageResult } from "../../supplierCatalogPageOptions";
import { mapBloomreachResult } from "./mapBloomreachResult";
import type { BloomreachSearchParams, BloomreachSearchResponse } from "./types";
import {
  clampStorefrontPageSize,
  STOREFRONT_DEFAULT_NUM_RESULTS,
} from "@/lib/search/storefront/storefrontCatalogConstants";

function buildBloomreachSearchUrl(
  query: string,
  config: BloomreachSearchParams["bloomreach"],
  page: number,
  pageSize: number
): string {
  const protocol = config.hostname.includes("localhost") ? "http" : "https";
  const base = `${protocol}://${config.hostname.replace(/\/$/, "")}/${config.apiPath.replace(/^\//, "")}/`;
  const params = new URLSearchParams({
    account_id: config.accountId,
    domain_key: config.domainKey,
    request_type: "search",
    search_type: "keyword",
    q: query,
    rows: String(pageSize),
    start: String((page - 1) * pageSize),
    fl: "pid,title,brand,url,thumb_image,price,sale_price",
    auth_key: config.authKey,
    _br_uid_2: "uid=agora:v=1:ts=1:hc=1",
  });
  return `${base}?${params.toString()}`;
}

export async function searchBloomreachCatalogPaged(
  params: BloomreachSearchParams
): Promise<SupplierCatalogPageResult> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) {
    return { products: [], totalCount: null, hasMore: false };
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampStorefrontPageSize(
    params.pageSize ?? params.bloomreach.numResults ?? STOREFRONT_DEFAULT_NUM_RESULTS
  );
  const url = buildBloomreachSearchUrl(q, params.bloomreach, page, pageSize);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Agora/1.0 (+supplier-discovery)",
      },
    });

    if (!res.ok) {
      console.warn(`Bloomreach search failed for ${params.logLabel}: HTTP ${res.status}`);
      return { products: [], totalCount: null, hasMore: false };
    }

    const data = (await res.json()) as BloomreachSearchResponse;
    const docs = data.response?.docs ?? [];
    const mapped: import("../../types").SupplierProductResult[] = [];

    for (const doc of docs) {
      for (const supplierId of params.supplierIds) {
        const row = mapBloomreachResult({
          doc,
          supplierId,
          source: params.source,
          config: params.bloomreach,
        });
        if (row) mapped.push(row);
      }
    }

    const totalCount =
      typeof data.response?.numFound === "number" ? data.response.numFound : null;

    return {
      products: mapped,
      totalCount,
      hasMore:
        totalCount != null
          ? page * pageSize < totalCount
          : mapped.length >= pageSize,
    };
  } catch (err) {
    console.warn(
      `Bloomreach search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { products: [], totalCount: null, hasMore: false };
  }
}

export async function searchBloomreachCatalog(
  params: BloomreachSearchParams
): Promise<import("../../types").SupplierProductResult[]> {
  const paged = await searchBloomreachCatalogPaged(params);
  return paged.products;
}
