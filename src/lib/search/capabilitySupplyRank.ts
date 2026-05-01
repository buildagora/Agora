/**
 * Relative supply-confidence tier (optional use outside material-request UI).
 * Material-request availability is computed in the UI via {@link getAvailabilityLabel}
 * in `capabilityDisplayShared.ts`.
 */
export type SupplyAvailabilityLabel = "IN_STOCK" | "AVAILABLE" | "CHECK";

export function deriveSupplyLabelFromRelativeScore(
  score: number,
  maxScore: number
): SupplyAvailabilityLabel {
  if (maxScore <= 0) return "CHECK";
  if (score === maxScore) return "IN_STOCK";
  if (score >= maxScore - 2) return "AVAILABLE";
  return "CHECK";
}
