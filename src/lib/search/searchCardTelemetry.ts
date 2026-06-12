import type { ExtractionStrategy } from "@prisma/client";

export type SupplierSearchGeoExcludedEvent = {
  event: "supplier_search_geo_excluded";
  supplierId: string;
  name: string;
  query: string;
  categoryId: string;
  capabilityScore: number;
  city: string | null;
  state: string | null;
  hasFingerprint: boolean;
  routerPrimaryStrategy?: ExtractionStrategy;
};

export type SupplierSearchLiveEvidenceEvent = {
  event: "supplier_search_live_evidence";
  query: string;
  supplierId: string;
  candidateRankBefore?: number;
  candidateRankAfter?: number;
  baseScore: number;
  liveBoost: number;
  finalScore: number;
  liveResultCount: number;
  finalStrategyUsed?: ExtractionStrategy;
  latencyMs?: number;
  skippedReason?: string;
};

function safeJsonLog(payload: Record<string, unknown>): void {
  try {
    console.info(JSON.stringify(payload));
  } catch {
    /* telemetry must never break search */
  }
}

export function logSupplierSearchGeoExcluded(
  payload: SupplierSearchGeoExcludedEvent
): void {
  safeJsonLog(payload);
}

export function logSupplierSearchLiveEvidence(
  payload: SupplierSearchLiveEvidenceEvent
): void {
  safeJsonLog(payload);
}
