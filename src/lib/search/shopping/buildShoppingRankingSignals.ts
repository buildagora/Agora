import { analyzeQueryRelevance } from "@/lib/search/relevance/analyzeQueryRelevance";
import type { ShoppingResultItem } from "./types";

export function buildShoppingRankingSignals(
  item: ShoppingResultItem,
  query: string,
): string[] {
  const relevance = analyzeQueryRelevance(query);
  const title = String(item.title || "").toLowerCase();
  const signals: string[] = [];

  if (title.includes(relevance.normalizedQuery)) {
    signals.push("exact_query_match");
  }

  if (relevance.tokens.some((token) => title.includes(token))) {
    signals.push("token_match");
  }

  if (relevance.importantTerms.some((term) => title.includes(term))) {
    signals.push("important_term_match");
  }

  if (relevance.conflictingBrandTerms.some((brand) => title.includes(brand))) {
    signals.push("conflicting_brand_penalty");
  }

  return signals;
}

