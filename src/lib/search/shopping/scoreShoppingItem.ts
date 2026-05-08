import { analyzeQueryRelevance } from "@/lib/search/relevance/analyzeQueryRelevance";
import type { ShoppingResultItem } from "./types";

export function scoreShoppingItem(item: ShoppingResultItem, query: string): number {
  const title = String(item.title || "").toLowerCase();
  const relevance = analyzeQueryRelevance(query);

  let score = 0;

  if (title.includes(relevance.normalizedQuery)) score += 50;

  for (const token of relevance.tokens) {
    if (title.includes(token)) score += 8;
  }

  for (const term of relevance.importantTerms) {
    if (title.includes(term)) score += 15;
  }

  for (const brand of relevance.conflictingBrandTerms) {
    if (title.includes(brand)) score -= 40;
  }

  return score;
}

