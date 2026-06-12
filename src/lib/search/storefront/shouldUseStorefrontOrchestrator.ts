import { isStorefrontOrchestratorFirst } from "@/lib/suppliers/routing/promotedOrchestratorRouting";
import { lookupStorefrontTier } from "./resolveStorefrontTier";

/**
 * READY-tier suppliers use the extraction orchestrator on storefront for max catalog depth.
 * Promoted env-gated suppliers continue to win when explicitly configured.
 */
export function shouldUseStorefrontOrchestrator(supplierId: string): boolean {
  if (isStorefrontOrchestratorFirst(supplierId)) return true;
  return lookupStorefrontTier(supplierId) === "READY";
}
