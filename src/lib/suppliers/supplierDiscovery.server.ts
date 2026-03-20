/**
 * Shared read-only supplier discovery by category (SupplierCategoryLink as source of truth).
 * Used by authenticated buyer talk API and public discovery API.
 */

import { getPrisma } from "@/lib/db.server";

export type DiscoverySupplierRow = {
  id: string;
  name: string;
  categories: string[];
};

/**
 * @param categoryId - When null, empty, or "all", returns all suppliers ordered by name.
 *   Otherwise filters by canonical lowercase category id on categoryLinks.
 */
export async function querySuppliersForDiscovery(
  categoryId: string | null | undefined
): Promise<DiscoverySupplierRow[]> {
  const prisma = getPrisma();
  const raw = categoryId?.trim() ?? "";
  const normalized = raw.toLowerCase();

  if (!normalized || normalized === "all") {
    const suppliers = await prisma.supplier.findMany({
      select: {
        id: true,
        name: true,
        categoryLinks: {
          select: { categoryId: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      categories: s.categoryLinks.map((link) => link.categoryId),
    }));
  }

  const suppliers = await prisma.supplier.findMany({
    where: {
      categoryLinks: {
        some: {
          categoryId: normalized,
        },
      },
    },
    select: {
      id: true,
      name: true,
      categoryLinks: {
        select: { categoryId: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    categories: s.categoryLinks.map((link) => link.categoryId),
  }));
}
