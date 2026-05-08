import type { SupplierProductResult } from "@/lib/suppliers/types";
import { buildOrganicRankingSignals } from "./buildOrganicRankingSignals";
import { scoreOrganicResult } from "./scoreOrganicResult";

export function rankOrganicResults(
  rows: SupplierProductResult[],
  query: string,
): SupplierProductResult[] {
  const rankedRows = rows
    .map((row) => {
      const score = scoreOrganicResult(row, query);
      return {
        row: {
          ...row,
          score,
          rankingSignals: buildOrganicRankingSignals(row, query),
        } satisfies SupplierProductResult,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((r) => r.row);

  // Keep fallback behavior for hard queries, but suppress obvious junk
  // once there is at least one positively-scored result.
  const hasPositiveScore = rankedRows.some((row) => (row.score ?? 0) > 0);
  if (!hasPositiveScore) return rankedRows;

  return rankedRows.filter((row) => (row.score ?? 0) > 0);
}

