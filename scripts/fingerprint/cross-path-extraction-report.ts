/**
 * Phase 8A — cross-path extraction observability report (read-only).
 *
 * Parses supplier_extraction_route and supplier_extraction_observation JSON
 * lines from stdin or a log file and prints a comparison table.
 *
 *   npm run fingerprint:cross-path-report -- scripts/output/sample.log
 *   cat app.log | npm run fingerprint:cross-path-report
 */
import { readFileSync } from "node:fs";
import {
  buildCrossPathExtractionRecord,
  compareCrossPathRecords,
  formatCrossPathReportTable,
  type CrossPathExtractionRecord,
} from "../../src/lib/suppliers/routing/crossPathExtractionObservability";
import type { SupplierExtractionEntryPoint } from "../../src/lib/suppliers/routing/extractionTelemetry";
import type { SupplierExtractionObservedPath } from "../../src/lib/suppliers/routing/extractionTelemetry";
import type { RouterExecutionMode } from "../../src/lib/suppliers/routing/routerExecutionMode";

type ParsedLine = Record<string, unknown>;

function parseJsonLines(input: string): ParsedLine[] {
  const rows: ParsedLine[] = [];
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      rows.push(JSON.parse(trimmed) as ParsedLine);
    } catch {
      /* skip non-JSON */
    }
  }
  return rows;
}

function toRecord(line: ParsedLine): CrossPathExtractionRecord | null {
  const event = line.event;
  if (
    event !== "supplier_extraction_route" &&
    event !== "supplier_extraction_observation"
  ) {
    return null;
  }

  const supplierId = String(line.supplierId ?? "");
  const query = String(line.query ?? "");
  if (!supplierId) return null;

  const entryPoint = (line.entryPoint ??
    "unknown") as SupplierExtractionEntryPoint;
  const executionPath = (line.executionPath ??
    "unknown") as SupplierExtractionObservedPath;
  const executionMode = (line.executionMode ??
    "off") as RouterExecutionMode;

  const resultCount =
    typeof line.resultCountRouter === "number"
      ? line.resultCountRouter
      : typeof line.resultCountLegacy === "number"
        ? line.resultCountLegacy
        : typeof line.resultCount === "number"
          ? line.resultCount
          : 0;

  const strategyUsed =
    typeof line.finalStrategyUsed === "string"
      ? line.finalStrategyUsed
      : typeof line.strategyUsed === "string"
        ? line.strategyUsed
        : undefined;

  return buildCrossPathExtractionRecord({
    supplierId,
    query,
    entryPoint,
    executionPath,
    strategyUsed,
    resultCount,
    executionMode,
  });
}

function main() {
  const file = process.argv[2];
  const input = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  const records = parseJsonLines(input)
    .map(toRecord)
    .filter((r): r is CrossPathExtractionRecord => r != null);

  console.log("\n=== Cross-path extraction report ===\n");
  console.log(formatCrossPathReportTable(records));
  console.log("");

  const divergent = compareCrossPathRecords(records).filter(
    (row) => row.pathsDiffer || row.countsDiffer
  );
  console.log(`Records: ${records.length}`);
  console.log(`Divergent supplier/query pairs: ${divergent.length}`);
}

main();
