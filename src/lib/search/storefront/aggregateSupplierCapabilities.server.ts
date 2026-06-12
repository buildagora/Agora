import { getPrisma } from "@/lib/db.server";
import { aggregateSupplierCapabilitiesFromRows } from "./aggregateSupplierCapabilitiesFromRows";
import type {
  AggregateSupplierCapabilitiesOptions,
  SupplierCapabilityAggregate,
} from "./capabilityAggregateTypes";

/**
 * Load SupplierCapability rows for a supplier and aggregate brands, categories,
 * and subcategories for storefront sections.
 */
export async function aggregateSupplierCapabilities(
  supplierId: string,
  options: AggregateSupplierCapabilitiesOptions = {}
): Promise<SupplierCapabilityAggregate> {
  const prisma = getPrisma();
  const rows = await prisma.supplierCapability.findMany({
    where: { supplierId },
    select: {
      categoryId: true,
      subcategory: true,
      brand: true,
      sourceUrl: true,
      confidence: true,
    },
    orderBy: [{ categoryId: "asc" }, { subcategory: "asc" }, { brand: "asc" }],
  });

  return aggregateSupplierCapabilitiesFromRows(supplierId, rows, options);
}
