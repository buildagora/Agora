import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import type { SupplierProductResult } from "@/lib/suppliers/types";

function classificationSignal(resultType: SearchResultType): string | null {
  switch (resultType) {
    case "PRODUCT_PAGE":
      return "product_page";
    case "CATEGORY_PAGE":
      return "category_page";
    case "BRAND_PAGE":
      return "brand_page";
    case "SEARCH_PAGE":
      return "search_page";
    case "HOMEPAGE":
      return "homepage_penalty";
    case "PDF_PAGE":
      return "pdf_penalty";
    case "DOCUMENTATION_PAGE":
      return "documentation_page";
    case "BLOG_PAGE":
      return "blog_page";
    default:
      return null;
  }
}

export function buildOrganicRankingSignals(
  row: SupplierProductResult,
  query: string,
): string[] {
  const queryLower = query.toLowerCase();
  const tokens = queryLower.split(/\s+/).filter(Boolean);
  const title = String(row.title || "").toLowerCase();
  const signals: string[] = [];

  const clsSignal = classificationSignal(row.classification ?? "UNKNOWN");
  if (clsSignal) signals.push(clsSignal);

  if (title.includes(queryLower)) {
    signals.push("exact_query_match");
  }

  if (tokens.some((token) => title.includes(token))) {
    signals.push("token_match");
  }

  return signals;
}

