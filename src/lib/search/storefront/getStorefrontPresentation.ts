import type { SupplierStorefrontView } from "./types";

export type StorefrontSectionKey =
  | "brands"
  | "categories"
  | "navigationLinks"
  | "products"
  | "capabilityProfiles"
  | "emptyState";

export type StorefrontPresentation = {
  archetype: "abc" | "distributor" | "big_box" | "default";
  explorationSectionOrder: StorefrontSectionKey[];
};

function detectArchetype(supplierId: string): StorefrontPresentation["archetype"] {
  if (supplierId.startsWith("abc_supply")) return "abc";
  if (supplierId.startsWith("home_depot") || supplierId.startsWith("lowes")) {
    return "big_box";
  }
  if (
    supplierId.startsWith("grainger") ||
    supplierId.startsWith("ferguson")
  ) {
    return "distributor";
  }
  return "default";
}

export function getStorefrontPresentation(
  view: Pick<SupplierStorefrontView, "supplier" | "layoutMode">
): StorefrontPresentation {
  const archetype = detectArchetype(view.supplier.id);

  if (view.layoutMode === "PRODUCT_FIRST") {
    return {
      archetype,
      explorationSectionOrder: ["products", "capabilityProfiles", "emptyState"],
    };
  }

  if (archetype === "abc") {
    return {
      archetype,
      explorationSectionOrder: [
        "brands",
        "categories",
        "navigationLinks",
        "products",
        "capabilityProfiles",
        "emptyState",
      ],
    };
  }

  if (archetype === "big_box") {
    return {
      archetype,
      explorationSectionOrder: [
        "products",
        "categories",
        "brands",
        "navigationLinks",
        "capabilityProfiles",
        "emptyState",
      ],
    };
  }

  // Grainger, Ferguson, default distributors
  return {
    archetype: "distributor",
    explorationSectionOrder: [
      "categories",
      "navigationLinks",
      "brands",
      "products",
      "capabilityProfiles",
      "emptyState",
    ],
  };
}
