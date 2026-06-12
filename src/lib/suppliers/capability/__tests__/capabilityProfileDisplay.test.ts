import type { SupplierProductResult } from "../../types";
import {
  CAPABILITY_PROFILE_BADGE,
  CAPABILITY_PROFILE_CTA_CONTACT,
  CAPABILITY_PROFILE_CTA_EVIDENCE,
  CAPABILITY_PROFILE_DISCLAIMER,
  enrichSupplierProductSearchResponse,
  getCapabilityProfileCardDisplay,
} from "../capabilityProfileDisplay";
import { CAPABILITY_PROFILE_RANKING_SIGNALS } from "../profileResultContract";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function profileRow(
  overrides: Partial<SupplierProductResult> = {}
): SupplierProductResult {
  return {
    supplierId: "abc_supply_hsv",
    title: "Likely carries: Atlas — Asphalt Shingles",
    brand: "Atlas",
    imageUrl: null,
    price: null,
    productUrl: "https://www.abcsupply.com/products/",
    source: "ABC_SUPPLY",
    availability: "Likely carries",
    classification: "BRAND_PAGE",
    rankingSignals: [...CAPABILITY_PROFILE_RANKING_SIGNALS],
    ...overrides,
  };
}

function liveRow(): SupplierProductResult {
  return {
    supplierId: "grainger_hsv",
    title: "#8 Screw",
    productUrl: "https://www.grainger.com/product/123",
    source: "GRAINGER",
    classification: "PRODUCT_PAGE",
    price: "$12.99",
    imageUrl: "https://example.com/i.jpg",
  };
}

console.log("\ncapabilityProfileDisplay tests\n");

const withEvidence = getCapabilityProfileCardDisplay(profileRow());
assert(withEvidence.badge === CAPABILITY_PROFILE_BADGE, "badge is Likely carries");
assert(
  withEvidence.disclaimer === CAPABILITY_PROFILE_DISCLAIMER,
  "disclaimer present"
);
assert(withEvidence.showPrice === false, "price hidden");
assert(
  withEvidence.ctaLabel === CAPABILITY_PROFILE_CTA_EVIDENCE,
  "evidence CTA when productUrl exists"
);
assert(withEvidence.ctaExternal === true, "evidence link is external");
assert(
  withEvidence.ctaHref === "https://www.abcsupply.com/products/",
  "evidence href preserved"
);

const withoutEvidence = getCapabilityProfileCardDisplay(
  profileRow({ productUrl: null }),
  "tel:+15551234567"
);
assert(
  withoutEvidence.ctaLabel === CAPABILITY_PROFILE_CTA_CONTACT,
  "contact CTA when no productUrl"
);
assert(
  withoutEvidence.ctaHref === "tel:+15551234567",
  "contact uses telHref"
);
assert(withoutEvidence.ctaExternal === false, "contact link is not external");

const enriched = enrichSupplierProductSearchResponse([
  liveRow(),
  profileRow(),
]);
assert(enriched.resultSummary.live === 1, "resultSummary live count");
assert(
  enriched.resultSummary.capabilityProfile === 1,
  "resultSummary capabilityProfile count"
);
assert(
  enriched.results[0]?.resultKind === "live",
  "live row resultKind"
);
assert(
  enriched.results[1]?.resultKind === "capability_profile",
  "profile row resultKind"
);

console.log("\nAll capabilityProfileDisplay tests passed.\n");
