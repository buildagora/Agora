export const LOWES_PRODUCT_ENGINE_SUPPLIERS = [
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
  "lowes_south_hsv",
] as const;

export const HOME_DEPOT_PRODUCT_ENGINE_SUPPLIERS = [
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
] as const;

export type ProductEngineAdapter = "lowes" | "home_depot";

export function resolveProductEngineAdapter(
  supplierId: string
): ProductEngineAdapter | null {
  if (
    (LOWES_PRODUCT_ENGINE_SUPPLIERS as readonly string[]).includes(supplierId)
  ) {
    return "lowes";
  }
  if (
    (HOME_DEPOT_PRODUCT_ENGINE_SUPPLIERS as readonly string[]).includes(
      supplierId
    )
  ) {
    return "home_depot";
  }
  return null;
}

export function isProductEngineSupplier(supplierId: string): boolean {
  return resolveProductEngineAdapter(supplierId) !== null;
}
