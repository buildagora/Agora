import { analyzeQueryRelevance } from "@/lib/search/relevance/analyzeQueryRelevance";
import type { SupplierProductResult } from "@/lib/suppliers/types";

export function scoreOrganicResult(row: SupplierProductResult, query: string): number {
  const relevance = analyzeQueryRelevance(query);
  const title = String(row.title || "").toLowerCase();
  let score = 0;

  if (title.includes(relevance.normalizedQuery)) score += 50;

  for (const token of relevance.tokens) {
    if (title.includes(token)) score += 8;
  }

  for (const term of relevance.importantTerms) {
    if (title.includes(term)) {
      score += 20;
    }
  }

  for (const brand of relevance.conflictingBrandTerms) {
    if (title.includes(brand)) score -= 50;
  }

  return score;
}

