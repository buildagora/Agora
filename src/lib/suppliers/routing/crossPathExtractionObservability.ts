import type { SupplierExtractionEntryPoint } from "./extractionTelemetry";
import type { SupplierExtractionObservedPath } from "./extractionTelemetry";
import type { RouterExecutionMode } from "./routerExecutionMode";

/** Single observed extraction attempt for cross-path comparison. */
export type CrossPathExtractionRecord = {
  supplierId: string;
  query: string;
  entryPoint: SupplierExtractionEntryPoint;
  executionPath: SupplierExtractionObservedPath;
  strategyUsed?: string;
  resultCount: number;
  executionMode: RouterExecutionMode;
  observedAt: string;
};

export type CrossPathComparisonRow = {
  supplierId: string;
  query: string;
  byEntryPoint: Partial<
    Record<
      SupplierExtractionEntryPoint,
      Pick<
        CrossPathExtractionRecord,
        "executionPath" | "strategyUsed" | "resultCount"
      >
    >
  >;
  pathsDiffer: boolean;
  countsDiffer: boolean;
};

export function buildCrossPathExtractionRecord(
  input: Omit<CrossPathExtractionRecord, "observedAt"> & { observedAt?: string }
): CrossPathExtractionRecord {
  return {
    ...input,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

export function compareCrossPathRecords(
  records: CrossPathExtractionRecord[]
): CrossPathComparisonRow[] {
  const groups = new Map<string, CrossPathExtractionRecord[]>();

  for (const record of records) {
    const key = `${record.supplierId}\0${record.query}`;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }

  const rows: CrossPathComparisonRow[] = [];

  for (const [, group] of groups) {
    const first = group[0];
    const byEntryPoint: CrossPathComparisonRow["byEntryPoint"] = {};

    for (const record of group) {
      byEntryPoint[record.entryPoint] = {
        executionPath: record.executionPath,
        strategyUsed: record.strategyUsed,
        resultCount: record.resultCount,
      };
    }

    const paths = new Set(group.map((r) => r.executionPath));
    const counts = new Set(group.map((r) => r.resultCount));

    rows.push({
      supplierId: first.supplierId,
      query: first.query,
      byEntryPoint,
      pathsDiffer: paths.size > 1,
      countsDiffer: counts.size > 1,
    });
  }

  return rows.sort((a, b) =>
    a.supplierId === b.supplierId
      ? a.query.localeCompare(b.query)
      : a.supplierId.localeCompare(b.supplierId)
  );
}

export function formatCrossPathReportTable(
  records: CrossPathExtractionRecord[]
): string {
  const comparisons = compareCrossPathRecords(records);
  const lines: string[] = [
    "supplierId | query | entryPoint | executionPath | strategyUsed | resultCount | executionMode",
    "-".repeat(90),
  ];

  for (const record of records) {
    lines.push(
      [
        record.supplierId,
        JSON.stringify(record.query),
        record.entryPoint,
        record.executionPath,
        record.strategyUsed ?? "-",
        String(record.resultCount),
        record.executionMode,
      ].join(" | ")
    );
  }

  if (comparisons.length > 0) {
    lines.push("");
    lines.push("Cross-path divergence summary:");
    for (const row of comparisons) {
      if (!row.pathsDiffer && !row.countsDiffer) continue;
      lines.push(
        `- ${row.supplierId} @ ${JSON.stringify(row.query)}: pathsDiffer=${row.pathsDiffer} countsDiffer=${row.countsDiffer}`
      );
    }
  }

  return lines.join("\n");
}
