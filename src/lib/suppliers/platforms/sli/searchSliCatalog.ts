import { mapSliProduct, parseSliSearchHtml } from "./mapSliResult";
import type { SliSearchParams } from "./types";

function buildSliSearchUrl(query: string, config: SliSearchParams["sli"]): string {
  const params = new URLSearchParams({ [config.queryParam]: query });
  return `${config.siteOrigin}${config.searchPath}?${params.toString()}`;
}

export async function searchSliCatalog(
  params: SliSearchParams
): Promise<import("../../types").SupplierProductResult[]> {
  const q = params.query.trim();
  if (!q || params.supplierIds.length === 0) return [];

  const url = buildSliSearchUrl(q, params.sli);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Agora/1.0 (+supplier-discovery)",
      },
    });

    if (!res.ok) {
      console.warn(`SLI search failed for ${params.logLabel}: HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const products = parseSliSearchHtml(html, params.sli.siteOrigin).slice(
      0,
      params.sli.numResults
    );
    const mapped: import("../../types").SupplierProductResult[] = [];

    for (const product of products) {
      for (const supplierId of params.supplierIds) {
        mapped.push(
          mapSliProduct({
            product,
            supplierId,
            source: params.source,
          })
        );
      }
    }

    return mapped;
  } catch (err) {
    console.warn(
      `SLI search failed for ${params.logLabel}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}
