import type { SupplierProductResult } from "../types";
import { isCapabilityProfileResult } from "./profileResultContract";

export type PartitionDiscoveryResults = {
  liveProducts: SupplierProductResult[];
  capabilityProfiles: SupplierProductResult[];
};

/**
 * Split discovery/router rows into live inventory vs capability profile matches.
 * Uses {@link isCapabilityProfileResult} as the sole detection gate.
 */
export function partitionDiscoveryResults(
  rows: SupplierProductResult[]
): PartitionDiscoveryResults {
  const liveProducts: SupplierProductResult[] = [];
  const capabilityProfiles: SupplierProductResult[] = [];

  for (const row of rows) {
    if (isCapabilityProfileResult(row)) {
      capabilityProfiles.push(row);
    } else {
      liveProducts.push(row);
    }
  }

  return { liveProducts, capabilityProfiles };
}
