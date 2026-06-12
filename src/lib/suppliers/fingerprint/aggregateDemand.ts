import type { DemandPriority } from "@prisma/client";
import type { DemandResolution } from "./types";

/** Recipient count at or above this → CRITICAL. */
const CRITICAL_THRESHOLD = 50;
/** At or above → HIGH. */
const HIGH_THRESHOLD = 20;
/** At or above → MEDIUM. */
const MEDIUM_THRESHOLD = 5;

/**
 * Map a material-request recipient count to demandPriority (pure, no DB).
 * Zero or missing signal → LOW (deprioritize refresh until demand appears).
 */
export function resolveDemandPriority(
  demandScore: number | null | undefined
): DemandResolution {
  if (demandScore == null || demandScore <= 0) {
    return { demandPriority: "LOW", demandScore: demandScore ?? null };
  }

  if (demandScore >= CRITICAL_THRESHOLD) {
    return { demandPriority: "CRITICAL", demandScore };
  }
  if (demandScore >= HIGH_THRESHOLD) {
    return { demandPriority: "HIGH", demandScore };
  }
  if (demandScore >= MEDIUM_THRESHOLD) {
    return { demandPriority: "MEDIUM", demandScore };
  }
  return { demandPriority: "LOW", demandScore };
}
