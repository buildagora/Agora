import { lookupBrandLogo } from "./brandLogoRegistry";
import { lookupCategoryVisual } from "./categoryVisualRegistry";
import { resolveStorefrontDisplayImage } from "./resolveStorefrontDisplayImage";
import type { StorefrontImageCoverageReport } from "./storefrontImageCoverage";
import type { StorefrontSections } from "./types";

export type VisualConfidenceTier =
  | "HIGH_VISUAL_CONFIDENCE"
  | "MEDIUM_VISUAL_CONFIDENCE"
  | "LOW_VISUAL_CONFIDENCE";

export type StorefrontVisualReliabilityReport = {
  supplierId: string;
  supplierLabel: string;
  supplierLogoScore: number;
  productImageScore: number;
  brandLogoScore: number;
  categoryIconScore: number;
  capabilityVisualScore: number;
  overallVisualScore: number;
  tier: VisualConfidenceTier;
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100;
  return Math.round((numerator / denominator) * 100);
}

function scoreNavItems(
  items: { label: string; imageUrl?: string | null }[],
  slot: "brand" | "category"
): number {
  if (items.length === 0) return 100;
  let good = 0;
  for (const item of items) {
    const display = resolveStorefrontDisplayImage({
      slot,
      label: item.label,
      imageUrl: item.imageUrl,
    });
    if (display.mode === "image") {
      good += 1;
      continue;
    }
    if (slot === "brand" && lookupBrandLogo(item.label)) good += 1;
    if (slot === "category" && lookupCategoryVisual(item.label)) good += 1;
  }
  return pct(good, items.length);
}

function scoreCapabilityVisuals(sections: StorefrontSections): number {
  const profiles = sections.capabilityProfiles;
  const brands = sections.brands;
  const categories = sections.categories;

  if (profiles.length === 0 && brands.length === 0 && categories.length === 0) {
    return 100;
  }

  let points = 0;
  let max = 0;

  for (const profile of profiles) {
    max += 1;
    if (profile.brand && lookupBrandLogo(profile.brand)) {
      points += 1;
    } else if (profile.brand) {
      points += 0.4;
    } else if (lookupCategoryVisual(profile.title)) {
      points += 0.5;
    } else {
      points += 0.2;
    }
  }

  max += brands.length;
  for (const brand of brands) {
    if (lookupBrandLogo(brand.label) || brand.imageUrl) points += 1;
    else points += 0.3;
  }

  max += categories.length;
  for (const cat of categories) {
    if (lookupCategoryVisual(cat.label) || cat.imageUrl) points += 1;
    else points += 0.4;
  }

  if (max === 0) return 100;
  return Math.round((points / max) * 100);
}

export function classifyVisualConfidence(
  overallVisualScore: number
): VisualConfidenceTier {
  if (overallVisualScore >= 75) return "HIGH_VISUAL_CONFIDENCE";
  if (overallVisualScore >= 40) return "MEDIUM_VISUAL_CONFIDENCE";
  return "LOW_VISUAL_CONFIDENCE";
}

export function buildStorefrontVisualReliabilityReport(input: {
  supplierId: string;
  supplierLabel: string;
  sections: StorefrontSections;
  supplierLogoUrl?: string | null;
  coverage: StorefrontImageCoverageReport;
}): StorefrontVisualReliabilityReport {
  const { coverage, sections } = input;

  const supplierLogoScore = input.supplierLogoUrl?.trim() ? 100 : 50;

  const productImageScore = pct(
    coverage.products.withImageUrl,
    coverage.products.rendered
  );

  const brandLogoScore = scoreNavItems(sections.brands, "brand");

  const categoryIconScore = scoreNavItems(sections.categories, "category");

  const capabilityVisualScore = scoreCapabilityVisuals(sections);

  const overallVisualScore = Math.round(
    supplierLogoScore * 0.15 +
      productImageScore * 0.35 +
      brandLogoScore * 0.25 +
      categoryIconScore * 0.15 +
      capabilityVisualScore * 0.1
  );

  return {
    supplierId: input.supplierId,
    supplierLabel: input.supplierLabel,
    supplierLogoScore,
    productImageScore,
    brandLogoScore,
    categoryIconScore,
    capabilityVisualScore,
    overallVisualScore,
    tier: classifyVisualConfidence(overallVisualScore),
  };
}

export function formatVisualReliabilityReport(
  reports: StorefrontVisualReliabilityReport[]
): string {
  const lines = [
    "Storefront visual reliability report",
    "",
    "| Supplier | Overall | Tier | Logo | Products | Brands | Categories | Capability |",
    "|----------|---------|------|------|----------|--------|------------|------------|",
  ];

  for (const r of reports) {
    lines.push(
      `| ${r.supplierLabel} | ${r.overallVisualScore} | ${r.tier.replace("_VISUAL_CONFIDENCE", "")} | ${r.supplierLogoScore} | ${r.productImageScore} | ${r.brandLogoScore} | ${r.categoryIconScore} | ${r.capabilityVisualScore} |`
    );
  }

  return lines.join("\n");
}
