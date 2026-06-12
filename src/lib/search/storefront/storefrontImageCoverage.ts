import { resolveStorefrontDisplayImage } from "./resolveStorefrontDisplayImage";
import type { StorefrontSections } from "./types";

export type StorefrontCardCoverageCounts = {
  rendered: number;
  withImage: number;
  fallbackTiles: number;
};

export type StorefrontProductCoverageCounts = {
  rendered: number;
  withImageUrl: number;
  placeholderTiles: number;
};

export type StorefrontImageCoverageReport = {
  supplierId: string;
  supplierLabel: string;
  brands: StorefrontCardCoverageCounts;
  categories: StorefrontCardCoverageCounts;
  navigationLinks: StorefrontCardCoverageCounts;
  products: StorefrontProductCoverageCounts;
};

function countNavCards(
  items: { label: string; imageUrl?: string | null }[],
  slot: "brand" | "category"
): StorefrontCardCoverageCounts {
  let withImage = 0;
  let fallbackTiles = 0;

  for (const item of items) {
    const display = resolveStorefrontDisplayImage({
      slot,
      label: item.label,
      imageUrl: item.imageUrl,
    });
    if (display.mode === "image") withImage += 1;
    if (display.mode === "brand_tile" || display.mode === "category_tile") {
      fallbackTiles += 1;
    }
  }

  return {
    rendered: items.length,
    withImage,
    fallbackTiles,
  };
}

function countProducts(
  products: { title: string; imageUrl?: string | null }[]
): StorefrontProductCoverageCounts {
  let withImageUrl = 0;
  let placeholderTiles = 0;

  for (const product of products) {
    const display = resolveStorefrontDisplayImage({
      slot: "product",
      label: product.title,
      imageUrl: product.imageUrl,
    });
    if (display.mode === "image") withImageUrl += 1;
    if (display.mode === "product_placeholder" || display.mode === "product_text") {
      placeholderTiles += 1;
    }
  }

  return {
    rendered: products.length,
    withImageUrl,
    placeholderTiles,
  };
}

export function buildStorefrontImageCoverageReport(input: {
  supplierId: string;
  supplierLabel: string;
  sections: StorefrontSections;
}): StorefrontImageCoverageReport {
  return {
    supplierId: input.supplierId,
    supplierLabel: input.supplierLabel,
    brands: countNavCards(input.sections.brands, "brand"),
    categories: countNavCards(input.sections.categories, "category"),
    navigationLinks: countNavCards(input.sections.navigationLinks, "category"),
    products: countProducts(input.sections.products),
  };
}

export function formatStorefrontImageCoverageReport(
  reports: StorefrontImageCoverageReport[]
): string {
  const lines: string[] = [
    "Storefront image coverage report",
    "",
    "| Supplier | Brands (img/tile) | Categories (img/tile) | Nav links (img/tile) | Products (img/placeholder) |",
    "|----------|-------------------|------------------------|----------------------|---------------------|",
  ];

  for (const r of reports) {
    lines.push(
      `| ${r.supplierLabel} | ${r.brands.rendered} (${r.brands.withImage}/${r.brands.fallbackTiles}) | ${r.categories.rendered} (${r.categories.withImage}/${r.categories.fallbackTiles}) | ${r.navigationLinks.rendered} (${r.navigationLinks.withImage}/${r.navigationLinks.fallbackTiles}) | ${r.products.rendered} (${r.products.withImageUrl}/${r.products.placeholderTiles}) |`
    );
  }

  lines.push("");
  lines.push(
    "Legend: rendered (withImage or registry / fallbackTiles | withImageUrl / placeholderTiles for products)"
  );
  return lines.join("\n");
}
