import type {
  StorefrontArchetype,
  StorefrontArchetypePresentation,
  StorefrontSidebarSection,
  StorefrontTier,
} from "./types";

const BIG_BOX_IDS = new Set([
  "home_depot_hsv",
  "home_depot_madison",
  "home_depot_north_hsv",
  "home_depot_south_hsv",
  "home_depot_west_hsv",
  "lowes_hsv",
  "lowes_madison",
  "lowes_madison_hsv",
  "lowes_north_hsv",
]);

const PLATFORM_IDS = new Set([
  "floor_decor_hsv",
  "floor_decor_madison",
  "ppg_hsv",
  "qxo_hsv",
  "siteone_hsv",
]);

const DISTRIBUTOR_IDS = new Set([
  "ferguson_plumbing_hsv",
  "ferguson_hvac_hsv",
  "grainger_hsv",
  "graybar_hsv",
  "johnstone_hsv",
  "lennox_hsv",
]);

const BRAND_DRIVEN_IDS = new Set([
  "abc_supply_hsv",
  "srs_hsv",
  "gulfeagle_hsv",
  "lansing_hsv",
]);

const FLOORING_IDS = new Set([
  "floor_decor_hsv",
  "floor_decor_madison",
  "ll_flooring_hsv",
  "daltile_hsv",
]);

function detectArchetype(supplierId: string, tier: StorefrontTier): StorefrontArchetype {
  if (tier === "CAPABILITY") return "CAPABILITY";
  if (
    BIG_BOX_IDS.has(supplierId) ||
    supplierId.startsWith("home_depot") ||
    supplierId.startsWith("lowes")
  ) {
    return "BIG_BOX";
  }
  if (FLOORING_IDS.has(supplierId)) return "FLOORING";
  if (PLATFORM_IDS.has(supplierId)) return "PLATFORM";
  if (BRAND_DRIVEN_IDS.has(supplierId) || supplierId.startsWith("abc_supply")) {
    return "BRAND_DRIVEN";
  }
  if (
    DISTRIBUTOR_IDS.has(supplierId) ||
    supplierId.startsWith("ferguson") ||
    supplierId.startsWith("grainger")
  ) {
    return "DISTRIBUTOR";
  }
  return "PLATFORM";
}

const ARCHETYPE_PRESENTATION: Record<
  StorefrontArchetype,
  Omit<StorefrontArchetypePresentation, "archetype">
> = {
  BIG_BOX: {
    sidebarOrder: ["categories", "attributes", "brands"],
    brandProminence: "medium",
    categoryProminence: "high",
    heroStyle: "catalog",
    gridColumns: 4,
  },
  PLATFORM: {
    sidebarOrder: ["categories", "attributes", "brands"],
    brandProminence: "medium",
    categoryProminence: "high",
    heroStyle: "catalog",
    gridColumns: 4,
  },
  DISTRIBUTOR: {
    sidebarOrder: ["categories", "attributes", "brands"],
    brandProminence: "low",
    categoryProminence: "high",
    heroStyle: "category",
    gridColumns: 3,
  },
  BRAND_DRIVEN: {
    sidebarOrder: ["brands", "categories", "attributes"],
    brandProminence: "high",
    categoryProminence: "medium",
    heroStyle: "brand",
    gridColumns: 3,
  },
  FLOORING: {
    sidebarOrder: ["categories", "brands", "attributes"],
    brandProminence: "medium",
    categoryProminence: "high",
    heroStyle: "category",
    gridColumns: 3,
  },
  CAPABILITY: {
    sidebarOrder: ["brands", "categories", "attributes"],
    brandProminence: "high",
    categoryProminence: "medium",
    heroStyle: "capability",
    gridColumns: 2,
  },
};

export function resolveStorefrontArchetype(
  supplierId: string,
  tier: StorefrontTier
): StorefrontArchetypePresentation {
  const archetype = detectArchetype(supplierId, tier);
  return { archetype, ...ARCHETYPE_PRESENTATION[archetype] };
}

export type { StorefrontSidebarSection };
