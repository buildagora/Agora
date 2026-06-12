import { rankOrganicResults } from "@/lib/search/organic/rankOrganicResults";
import type { SupplierProductResult } from "./types";

function normalizeTitleForDedupe(title: string | null | undefined): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function rowDedupeKey(row: SupplierProductResult): string {
  return `${row.supplierId}|${normalizeTitleForDedupe(row.title)}|${row.productUrl ?? ""}`;
}

/**
 * Legacy flat merge: products → categories → all mapped rows (deduped), then ranked.
 * `mapped` includes every row (products and categories are also present in mapped).
 */
export function mergeSupplierSiteSearchFlatRows(
  productResults: SupplierProductResult[],
  categoryResults: SupplierProductResult[],
  mapped: SupplierProductResult[],
  query: string
): SupplierProductResult[] {
  const mergeSeen = new Set<string>();
  const baseRowsRaw: SupplierProductResult[] = [];

  for (const row of productResults) {
    const k = rowDedupeKey(row);
    if (mergeSeen.has(k)) continue;
    mergeSeen.add(k);
    baseRowsRaw.push(row);
  }
  for (const row of categoryResults) {
    const k = rowDedupeKey(row);
    if (mergeSeen.has(k)) continue;
    mergeSeen.add(k);
    baseRowsRaw.push(row);
  }
  for (const row of mapped) {
    const k = rowDedupeKey(row);
    if (mergeSeen.has(k)) continue;
    mergeSeen.add(k);
    baseRowsRaw.push(row);
  }

  const baseRows = rankOrganicResults(baseRowsRaw, query);
  const deduped: SupplierProductResult[] = [];
  const seen = new Set<string>();
  for (const row of baseRows) {
    const key = rowDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export function dedupeSupplierSiteRows(
  rows: SupplierProductResult[]
): SupplierProductResult[] {
  const out: SupplierProductResult[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = rowDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
