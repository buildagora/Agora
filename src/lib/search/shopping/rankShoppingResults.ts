import { buildShoppingRankingSignals } from "./buildShoppingRankingSignals";
import { scoreShoppingItem } from "./scoreShoppingItem";
import type { RankedShoppingResult, ShoppingResultItem } from "./types";

export function rankShoppingResults(
  items: ShoppingResultItem[],
  query: string,
): RankedShoppingResult[] {
  return items
    .map((item) => ({
      item,
      score: scoreShoppingItem(item, query),
      rankingSignals: buildShoppingRankingSignals(item, query),
    }))
    .sort((a, b) => b.score - a.score);
}

