import type { KnownCategoryId } from "@/lib/ai/classifyQuery";

/** Expected category for audit fixtures (canonical marketplace ids). */
export type AuditExpectedCategory = KnownCategoryId;

/**
 * Supplier categories that should not appear for a given product intent.
 * Big-box live-catalog cards are always treated as relevant.
 */
export const SUSPICIOUS_CATEGORIES_BY_EXPECTED: Partial<
  Record<AuditExpectedCategory, readonly string[]>
> = {
  lumber_siding: [
    "plumbing",
    "hvac",
    "flooring",
    "concrete_cement",
    "electrical",
    "tools_equipment",
    "roofing",
    "paint",
    "landscaping",
  ],
  plumbing: [
    "roofing",
    "electrical",
    "concrete_cement",
    "hvac",
    "flooring",
    "tools_equipment",
    "lumber_siding",
    "paint",
  ],
  electrical: [
    "plumbing",
    "roofing",
    "hvac",
    "flooring",
    "paint",
    "concrete_cement",
    "lumber_siding",
  ],
  roofing: [
    "plumbing",
    "electrical",
    "concrete_cement",
    "hvac",
    "flooring",
    "paint",
    "tools_equipment",
  ],
  drywall: [
    "plumbing",
    "roofing",
    "hvac",
    "electrical",
    "flooring",
    "paint",
    "tools_equipment",
  ],
  concrete_cement: [
    "plumbing",
    "roofing",
    "hvac",
    "paint",
    "electrical",
    "flooring",
    "tools_equipment",
  ],
  paint: [
    "plumbing",
    "roofing",
    "hvac",
    "concrete_cement",
    "electrical",
    "tools_equipment",
  ],
  hvac: [
    "plumbing",
    "roofing",
    "flooring",
    "concrete_cement",
    "paint",
    "electrical",
    "tools_equipment",
  ],
  brick: ["plumbing", "hvac", "roofing", "paint", "electrical"],
  cabinets_countertops: [
    "plumbing",
    "roofing",
    "hvac",
    "concrete_cement",
    "electrical",
  ],
  decking_railing: ["plumbing", "hvac", "electrical", "paint"],
  fencing: ["plumbing", "hvac", "electrical", "roofing"],
  glass_glazing: ["plumbing", "hvac", "concrete_cement", "roofing"],
  gutter_drainage: ["plumbing", "hvac", "electrical", "paint"],
  hardware_fasteners: ["plumbing", "hvac", "roofing", "paint"],
  home_improvement: ["plumbing", "hvac", "concrete_cement"],
  insulation: ["plumbing", "hvac", "electrical", "roofing"],
  landscaping: ["plumbing", "hvac", "electrical", "roofing"],
  steel_metal: ["plumbing", "hvac", "paint", "flooring"],
  tile_stone: ["plumbing", "hvac", "electrical", "roofing"],
  tools_equipment: ["plumbing", "hvac", "roofing"],
  windows_doors: ["plumbing", "hvac", "concrete_cement", "electrical"],
  flooring: ["plumbing", "hvac", "roofing", "electrical", "concrete_cement"],
};

export function isSuspiciousSupplierCategory(
  supplierCategoryId: string,
  expectedCategory: AuditExpectedCategory,
  kind: "capability" | "live-catalog"
): boolean {
  if (kind === "live-catalog") return false;
  if (supplierCategoryId === expectedCategory) return false;
  const blocked =
    SUSPICIOUS_CATEGORIES_BY_EXPECTED[expectedCategory] ?? [];
  return blocked.includes(supplierCategoryId);
}

export function computeSearchQualityScore(args: {
  suppliers: Array<{
    categoryId: string;
    kind: "capability" | "live-catalog";
    capabilityScore: number | null;
    suspicious: boolean;
  }>;
  expectedCategory: AuditExpectedCategory;
  inferredCategory: string | null;
}): number {
  const top = args.suppliers.slice(0, 20);
  if (top.length === 0) return 0;

  const suspiciousCount = top.filter((s) => s.suspicious).length;
  const relevantCount = top.length - suspiciousCount;
  const alignmentPct = relevantCount / top.length;

  const capScores = top
    .map((s) => s.capabilityScore ?? 0)
    .filter((score) => score > 0);
  const avgCapability =
    capScores.length > 0
      ? capScores.reduce((sum, n) => sum + n, 0) / capScores.length
      : 0;
  const capabilityComponent = Math.min(15, avgCapability / 3);

  const inferredComponent =
    args.inferredCategory === args.expectedCategory
      ? 15
      : args.inferredCategory
        ? 0
        : 5;

  const suspiciousPenalty = suspiciousCount * 6;
  const raw =
    alignmentPct * 55 +
    capabilityComponent +
    inferredComponent +
    15 -
    suspiciousPenalty;

  return Math.max(0, Math.min(100, Math.round(raw)));
}
