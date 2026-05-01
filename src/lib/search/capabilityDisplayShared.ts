import type { CapabilitySearchResult } from "./capabilitySearch";
import type { SupplyAvailabilityLabel } from "./capabilitySupplyRank";

export type { SupplyAvailabilityLabel } from "./capabilitySupplyRank";
export { deriveSupplyLabelFromRelativeScore } from "./capabilitySupplyRank";

/**
 * Material-request / supplier UI availability (not search relevance).
 * Seeded/scraped capability matches indicate "Likely carries this", never "In Stock."
 */
export function getAvailabilityLabel({
  recipient,
  capabilityMatches,
}: {
  recipient: {
    availabilityStatus: string | null;
    status: string;
  };
  capabilityMatches: CapabilitySearchResult[] | undefined;
}): SupplyAvailabilityLabel {
  if (
    recipient.availabilityStatus === "IN_STOCK" ||
    recipient.status === "REPLIED"
  ) {
    return "IN_STOCK";
  }

  if (capabilityMatches?.some((m) => m.score >= 5)) {
    return "AVAILABLE";
  }

  return "CHECK";
}

/** Same as supplier cards: still waiting on operator/supplier for this row. */
export function recipientIsCapabilityChecking(recipient: {
  status: string;
  availabilityStatus: string | null;
}): boolean {
  return (
    recipient.availabilityStatus === "CHECKING" ||
    recipient.status === "SENT" ||
    recipient.status === "VIEWED"
  );
}

/** Top-right badge copy + colors (SENT/VIEWED override). */
export function getSupplyBadgeForLabel(
  supplyLabel: SupplyAvailabilityLabel
): { label: string; className: string } {
  switch (supplyLabel) {
    case "IN_STOCK":
      return {
        label: "In Stock",
        className:
          "bg-emerald-50 text-emerald-800 border border-emerald-200",
      };
    case "AVAILABLE":
      return {
        label: "Likely carries this",
        className: "bg-sky-50 text-sky-900 border border-sky-200",
      };
    case "CHECK":
      return {
        label: "Checking availability",
        className:
          "bg-amber-50 text-amber-900 border border-amber-200",
      };
  }
}

export function getCapabilitySupplyBadgeForSentViewed(
  status: string,
  supplyLabel: SupplyAvailabilityLabel | null
): { label: string; className: string } | null {
  if (status !== "SENT" && status !== "VIEWED") return null;
  if (supplyLabel == null) return null;
  return getSupplyBadgeForLabel(supplyLabel);
}

/** Alias for call sites that still use the old name. */
export function getCapabilityBadgeForSentViewed(
  status: string,
  supplyLabel: SupplyAvailabilityLabel | null
): { label: string; className: string } | null {
  return getCapabilitySupplyBadgeForSentViewed(status, supplyLabel);
}

/** Carries banner shell from relative supply tier. */
export function getCapabilityCarriesBannerClasses(
  supplyLabel: SupplyAvailabilityLabel | null
): string {
  switch (supplyLabel) {
    case "IN_STOCK":
      return "border-emerald-200/80 bg-emerald-50/70";
    case "AVAILABLE":
      return "border-sky-200/80 bg-sky-50/70";
    case "CHECK":
      return "border-amber-200/80 bg-amber-50/70";
    default:
      return "border-emerald-200/80 bg-emerald-50/70";
  }
}

/** Expanded supplier page headline (Availability block) while still checking. */
export function getDetailAvailabilityHeadline(args: {
  checking: boolean;
  availSummary: "In stock" | "Checking" | "Out of stock";
  supplyLabel: SupplyAvailabilityLabel | null;
}): string {
  if (!args.checking) {
    if (args.availSummary === "In stock") return "In stock";
    if (args.availSummary === "Out of stock") return "Out of stock";
    return "Checking availability";
  }
  switch (args.supplyLabel) {
    case "IN_STOCK":
      return "In Stock";
    case "AVAILABLE":
      return "Likely carries this";
    case "CHECK":
      return "Checking availability";
    default:
      return "Checking availability";
  }
}

export function getCapabilityMatchForSupplier(
  matches: CapabilitySearchResult[] | undefined,
  supplierId: string
): CapabilitySearchResult | undefined {
  return (matches ?? []).find((m) => m.supplierId === supplierId);
}

const CARRIES_DETAIL_SUFFIX =
  "Exact product, brand, and style can vary — contact this supplier for specifics.";

/** Plain “Carries … for …” line (no tier prefix). */
export function formatCapabilityCarriesSummary(
  match: { brands: string[]; subcategory: string }
): string {
  const brands = match.brands;
  if (brands.length === 0) return "";
  const topBrand = brands[0];
  const more = brands.length - 1;
  if (more <= 0) {
    return `Carries ${topBrand} for ${match.subcategory}`;
  }
  return `Carries ${topBrand} + ${more} more brand${more === 1 ? "" : "s"} for ${match.subcategory}`;
}

export type MatchDetailsDisplay =
  | { variant: "strong"; text: string }
  | { variant: "generic"; categoryDisplayName: string };

export function getMatchDetailsDisplay(
  match: CapabilitySearchResult | undefined,
  categoryDisplayName: string
): MatchDetailsDisplay {
  const brands = match?.brand?.trim()
    ? [match.brand.trim()]
    : [];
  if (match && brands.length > 0) {
    return {
      variant: "strong",
      text: `${formatCapabilityCarriesSummary({
        brands,
        subcategory: match.subcategory,
      })}. ${CARRIES_DETAIL_SUFFIX}`,
    };
  }
  return { variant: "generic", categoryDisplayName };
}
