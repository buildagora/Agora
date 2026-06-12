import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/db.rsc";
import { categoryIdToLabel } from "@/lib/categoryIds";
import { trackServerEvent } from "@/lib/analytics/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { searchCapabilities } from "@/lib/search/capabilitySearch";
import { buildSupplierStorefrontView } from "@/lib/search/storefront/buildSupplierStorefrontView.server";
import {
  composeStorefrontQuery,
  parseStorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import { toProductSearchQuery } from "@/lib/search/productSearchQuery";
import { getSearchMode } from "@/lib/search/getSearchMode";
import { SUPPLIER_STATUS_TEXT } from "@/lib/suppliers/statusText";
import SupplierStorefrontExperience from "@/components/supplier-storefront/SupplierStorefrontExperience";
import SupplierHeroCard from "@/components/supplier-storefront/SupplierHeroCard";
import ExactListingFocus from "@/components/supplier-storefront/ExactListingFocus";
import BackToSearchLink, { buildSearchBackHref } from "./BackToSearchLink";

export const revalidate = 0;

/** Same formula as `/api/buyer/material-requests` — distance in statute miles. */
function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthMi = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthMi * c;
}

function categoryLabel(categoryId: string): string {
  const raw = categoryId.trim().toLowerCase();
  if (!raw) return "Category";
  if (raw in categoryIdToLabel) {
    return categoryIdToLabel[raw as keyof typeof categoryIdToLabel];
  }
  return raw
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function statusBadgeLabel(status: string): string {
  const labels: Record<string, string> = {
    REPLIED: "Available",
    OUT_OF_STOCK: "Out of Stock",
    SENT: "Checking",
    VIEWED: "Checking",
    NO_RESPONSE: "No Response",
    DECLINED: "Declined",
  };
  return labels[status] || status;
}

function availabilitySummary(r: {
  status: string;
  availabilityStatus: string | null;
}): "In stock" | "Checking" | "Out of stock" {
  if (
    r.availabilityStatus === "IN_STOCK" ||
    r.status === "REPLIED"
  ) {
    return "In stock";
  }
  if (
    r.availabilityStatus === "OUT_OF_STOCK" ||
    r.status === "OUT_OF_STOCK"
  ) {
    return "Out of stock";
  }
  return "Checking";
}

function statusBadgeClasses(status: string): string {
  const colors: Record<string, string> = {
    REPLIED: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    SENT: "bg-amber-50 text-amber-800 border border-amber-200",
    VIEWED: "bg-amber-50 text-amber-800 border border-amber-200",
    OUT_OF_STOCK: "bg-orange-50 text-orange-800 border border-orange-200",
    NO_RESPONSE: "bg-zinc-50 text-zinc-600 border border-zinc-200",
    DECLINED: "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    colors[status] || "bg-zinc-50 text-zinc-600 border border-zinc-200"
  );
}

/**
 * Single-supplier view for a material request (public, same data as results).
 */
export default async function PublicSupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string; supplierId: string }>;
  searchParams?: Promise<{
    brand?: string;
    category?: string;
    listingTitle?: string;
    listingImage?: string;
    listingPrice?: string;
    listingUrl?: string;
    fromThread?: string;
    fromSearch?: string;
  }>;
}) {
  const { requestId: rawRequestId, supplierId: rawSupplierId } = await params;
  const requestId = rawRequestId?.trim() ?? "";
  const supplierId = rawSupplierId?.trim() ?? "";

  const resolvedSearchParams =
    searchParams != null ? await searchParams : undefined;
  const urlParams = parseStorefrontUrlParams(resolvedSearchParams);
  const { brand: brandFilter, category: categoryFilter } = urlParams;

  const listingTitle = urlParams.listingTitle ?? null;
  const listingImage = urlParams.listingImage ?? null;
  const listingPrice = urlParams.listingPrice ?? null;

  const backHref = buildSearchBackHref(
    urlParams.fromThread,
    urlParams.fromSearch
  );

  if (!requestId || !supplierId) {
    notFound();
  }

  const prisma = getPrisma();

  const materialRequest = await prisma.materialRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      categoryId: true,
      requestText: true,
      sendMode: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      fulfilledAt: true,
      locationCity: true,
      locationRegion: true,
      locationCountry: true,
      latitude: true,
      longitude: true,
      recipients: {
        select: {
          supplierId: true,
          conversationId: true,
          status: true,
          sentAt: true,
          viewedAt: true,
          respondedAt: true,
          statusUpdatedAt: true,
          operatorNotes: true,
          availabilityStatus: true,
          quantityAvailable: true,
          quantityUnit: true,
          price: true,
          priceUnit: true,
          pickupAvailable: true,
          deliveryAvailable: true,
          deliveryEta: true,
          supplier: {
            select: {
              id: true,
              name: true,
              domain: true,
              street: true,
              city: true,
              state: true,
              zip: true,
              latitude: true,
              longitude: true,
              phone: true,
              logoUrl: true,
              hoursText: true,
            },
          },
          conversation: {
            select: {
              id: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  if (!materialRequest) {
    notFound();
  }

  const requestText = (materialRequest.requestText || "").trim();
  const activeQuery = composeStorefrontQuery({
    requestText,
    brand: brandFilter,
    category: categoryFilter,
    listingTitle,
  });
  const productSearchQuery = toProductSearchQuery(activeQuery);

  // Transitional legacy support:
  // `capabilitySearch` comes from earlier manually-seeded inference.
  // Keep it only for search-mode inference + fallback option cards until full live-retrieval migration.
  const legacyCapabilityInferenceMatches = await searchCapabilities(
    productSearchQuery || activeQuery,
    { originalQuery: activeQuery }
  );

  const mode = listingTitle
    ? "EXACT"
    : getSearchMode(activeQuery, legacyCapabilityInferenceMatches);

  const selectedFromRecipients = materialRequest.recipients.find(
    (r) => r.supplierId === supplierId
  );

  type RecipientRow = (typeof materialRequest.recipients)[number];

  let selected: RecipientRow;

  if (selectedFromRecipients) {
    selected = selectedFromRecipients;
  } else {
    // Storefront browse: supplier exists but was not linked as a request recipient
    // (e.g. big-box deep link). Avoid 404; show catalog with neutral availability.
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        name: true,
        domain: true,
        street: true,
        city: true,
        state: true,
        zip: true,
        latitude: true,
        longitude: true,
        phone: true,
        logoUrl: true,
        hoursText: true,
      },
    });
    if (!supplier) {
      notFound();
    }
    selected = {
      supplierId: supplier.id,
      conversationId: "storefront-browse",
      status: "SENT",
      sentAt: materialRequest.createdAt,
      viewedAt: null,
      respondedAt: null,
      statusUpdatedAt: materialRequest.updatedAt,
      operatorNotes: null,
      availabilityStatus: null,
      quantityAvailable: null,
      quantityUnit: null,
      price: null,
      priceUnit: null,
      pickupAvailable: null,
      deliveryAvailable: null,
      deliveryEta: null,
      supplier,
      conversation: {
        id: "storefront-browse",
        updatedAt: materialRequest.updatedAt,
      },
    };
  }

  const supplierDomain = selected.supplier.domain?.trim() ?? null;
  const locationLabel = [
    materialRequest.locationCity,
    materialRequest.locationRegion,
  ]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(", ");

  const rows = materialRequest.recipients ?? [];
  const formatRecipient = (r: (typeof rows)[number]) => {
    const activityAt =
      r.respondedAt ??
      r.viewedAt ??
      r.statusUpdatedAt ??
      r.sentAt ??
      r.conversation?.updatedAt ??
      materialRequest.updatedAt;

    const reqLat = materialRequest.latitude;
    const reqLon = materialRequest.longitude;
    const supLat = r.supplier.latitude;
    const supLon = r.supplier.longitude;

    let distanceMiles: number | null = null;
    if (
      reqLat != null &&
      reqLon != null &&
      supLat != null &&
      supLon != null &&
      Number.isFinite(reqLat) &&
      Number.isFinite(reqLon) &&
      Number.isFinite(supLat) &&
      Number.isFinite(supLon)
    ) {
      const d = haversineMiles(reqLat, reqLon, supLat, supLon);
      distanceMiles = Math.round(d * 10) / 10;
    }

    return {
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      conversationId: r.conversationId,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      viewedAt: r.viewedAt?.toISOString() || null,
      respondedAt: r.respondedAt?.toISOString() || null,
      conversationUpdatedAt: activityAt.toISOString(),
      operatorNotes: r.operatorNotes ?? null,
      address: `${r.supplier.street}, ${r.supplier.city}, ${r.supplier.state} ${r.supplier.zip}`,
      phone: r.supplier.phone,
      logoUrl: r.supplier.logoUrl ?? null,
      hoursText: r.supplier.hoursText ?? null,
      availabilityStatus: r.availabilityStatus ?? null,
      quantityAvailable: r.quantityAvailable ?? null,
      quantityUnit: r.quantityUnit ?? null,
      price: r.price != null ? Number(r.price) : null,
      priceUnit: r.priceUnit ?? null,
      pickupAvailable: r.pickupAvailable ?? null,
      deliveryAvailable: r.deliveryAvailable ?? null,
      deliveryEta: r.deliveryEta ?? null,
      distanceMiles,
    };
  };

  const r = formatRecipient(selected);
  const cat = categoryLabel(materialRequest.categoryId);

  const storefront = await buildSupplierStorefrontView({
    query: activeQuery,
    productSearchQuery,
    categoryId: materialRequest.categoryId,
    categoryLabel: cat,
    listingTitle,
    brandFilter,
    categoryFilter,
    locationLabel: locationLabel || null,
    supplier: {
      id: supplierId,
      name: selected.supplier.name,
      logoUrl: selected.supplier.logoUrl ?? null,
      city: selected.supplier.city ?? null,
      state: selected.supplier.state ?? null,
      websiteUrl: supplierDomain ? `https://${supplierDomain}` : null,
    },
    searchMode: mode,
  });

  try {
    await trackServerEvent(ANALYTICS_EVENTS.storefront_viewed, {
      requestId: materialRequest.id,
      supplierId,
      tier: storefront.tier,
      productCount: storefront.catalogMetrics.productCount,
      layoutMode: storefront.layoutMode,
      discoveryStatus: storefront.discoveryStatus,
    });
  } catch {
    // fail silently
  }

  const automatedProduct = storefront.sections.products[0] ?? null;
  const hasLiveProducts = storefront.sections.products.length > 0;
  const hasCapabilityProfiles = storefront.sections.capabilityProfiles.length > 0;

  const avail = availabilitySummary(r);
  const checking = avail === "Checking";
  const supplierDiscoveryState = hasLiveProducts
    ? "AUTOMATED_DISCOVERY"
    : hasCapabilityProfiles
      ? "CAPABILITY_PROFILE"
      : avail === "In stock"
        ? "VERIFIED_IN_STOCK"
        : avail === "Out of stock"
          ? "OUT_OF_STOCK"
          : "CHECKING";

  const cityState = [selected.supplier.city, selected.supplier.state]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(", ");
  const hasFullAddress = Boolean(r.address && r.address.replace(/[, ]+/g, "").length > 0);
  const addressLine = hasFullAddress ? r.address : cityState || null;

  const hasQty = Boolean(r.quantityAvailable && r.quantityUnit);
  const hasPrice = Boolean(r.price && r.priceUnit);

  const quantityDisplay = hasQty
    ? `${r.quantityAvailable} ${r.quantityUnit}`
    : checking
      ? "—"
      : avail === "In stock"
        ? "Varies by product"
        : "—";

  const priceDisplay = hasPrice
    ? `$${r.price} / ${r.priceUnit}`
    : checking
      ? "Checking"
      : avail === "In stock"
        ? "Call for pricing"
        : "—";

  const triState = (v: boolean | null) => {
    if (v === true) return "Yes";
    if (v === false) return "No";
    if (checking) return "Checking";
    return "—";
  };

  const etaDisplay = r.deliveryEta?.trim() || "—";

  const pickupDisplay = checking
    ? r.pickupAvailable === true
      ? "Yes"
      : r.pickupAvailable === false
        ? "No"
        : "Checking"
    : triState(r.pickupAvailable);
  const deliveryDisplay = checking
    ? r.deliveryAvailable === true
      ? "Yes"
      : r.deliveryAvailable === false
        ? "No"
        : "Checking"
    : triState(r.deliveryAvailable);

  const normalizedRequestText = requestText || cat;
  const baseProductTitle = normalizedRequestText;

  // Derive a cleaner product name for UI
  function deriveDisplayProduct(title: string): string {
    const t = title.toLowerCase();

    if (t.includes("oakridge")) {
      return "Owens Corning Oakridge Architectural Shingles";
    }

    if (t.includes("hdz") || t.includes("timberline")) {
      return "GAF Timberline HDZ Architectural Shingles";
    }

    if (t.includes("landmark")) {
      return "CertainTeed Landmark Architectural Shingles";
    }

    if (t.includes("shingle")) {
      return "Architectural Roof Shingles";
    }

    return title;
  }

  const displayProductTitle = listingTitle
    ? listingTitle
    : automatedProduct?.title
      ? deriveDisplayProduct(automatedProduct.title)
      : deriveDisplayProduct(baseProductTitle);

  const imageSrc = listingImage || automatedProduct?.imageUrl || null;

  const productPriceDisplay =
    listingPrice ?? automatedProduct?.price ?? priceDisplay;

  const productStatusLabel =
    supplierDiscoveryState === "AUTOMATED_DISCOVERY"
      ? SUPPLIER_STATUS_TEXT.catalogMatch
      : supplierDiscoveryState === "CAPABILITY_PROFILE"
        ? SUPPLIER_STATUS_TEXT.likelyCarries
        : supplierDiscoveryState === "VERIFIED_IN_STOCK"
          ? SUPPLIER_STATUS_TEXT.inStock
          : supplierDiscoveryState === "OUT_OF_STOCK"
            ? SUPPLIER_STATUS_TEXT.outOfStock
            : SUPPLIER_STATUS_TEXT.checkingAvailability;
  const supplierStatusBadgeText =
    supplierDiscoveryState === "AUTOMATED_DISCOVERY"
      ? SUPPLIER_STATUS_TEXT.carriesThis
      : supplierDiscoveryState === "CAPABILITY_PROFILE"
        ? SUPPLIER_STATUS_TEXT.likelyCarries
        : supplierDiscoveryState === "VERIFIED_IN_STOCK"
          ? SUPPLIER_STATUS_TEXT.inStock
          : supplierDiscoveryState === "OUT_OF_STOCK"
            ? SUPPLIER_STATUS_TEXT.outOfStock
            : SUPPLIER_STATUS_TEXT.checkingAvailability;
  const supplierStatusBadgeClass =
    supplierDiscoveryState === "CAPABILITY_PROFILE"
      ? "bg-sky-50 text-sky-900 border-sky-200"
      : supplierDiscoveryState === "AUTOMATED_DISCOVERY" ||
          supplierDiscoveryState === "VERIFIED_IN_STOCK"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : supplierDiscoveryState === "OUT_OF_STOCK"
          ? "bg-orange-50 text-orange-800 border-orange-200"
          : "bg-amber-50 text-amber-800 border-amber-200";

  const telDigits = r.phone?.replace(/[^\d+]/g, "") ?? "";
  const telHref = telDigits.length > 0 ? `tel:${telDigits}` : null;
  const mapsQuery = addressLine;
  const directionsHref =
    mapsQuery && mapsQuery.length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
      : null;

  const showExactListingFocus =
    Boolean(listingTitle) ||
    (storefront.layoutMode === "PRODUCT_FIRST" &&
      hasLiveProducts &&
      (listingImage || automatedProduct?.imageUrl));

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-5 pb-12 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        {backHref && <BackToSearchLink href={backHref} />}

        <SupplierHeroCard
          supplierName={r.supplierName}
          logoUrl={r.logoUrl}
          categoryLabel={cat}
          distanceMiles={r.distanceMiles}
          addressLine={addressLine}
          phone={r.phone}
          hoursText={r.hoursText}
          availabilityLabel={supplierStatusBadgeText}
          availabilityClass={supplierStatusBadgeClass}
          discoveryStatus={storefront.discoveryStatus}
          catalogMetrics={storefront.catalogMetrics}
          telHref={telHref}
          directionsHref={directionsHref}
          requestId={materialRequest.id}
          supplierId={supplierId}
          tier={storefront.tier}
        />

        {showExactListingFocus ? (
          <ExactListingFocus
            supplierName={r.supplierName}
            title={displayProductTitle}
            imageSrc={imageSrc}
            priceDisplay={productPriceDisplay}
            quantityDisplay={quantityDisplay}
            productStatusLabel={productStatusLabel}
            supplierDiscoveryState={supplierDiscoveryState}
          />
        ) : null}

        <SupplierStorefrontExperience
          view={storefront}
          requestId={materialRequest.id}
          supplierId={supplierId}
          urlParams={urlParams}
          materialRequestText={materialRequest.requestText.trim() || "—"}
          productStatusLabel={productStatusLabel}
          fallbackPriceDisplay={priceDisplay}
          listingTitle={listingTitle}
        />

        {/* Supporting context */}
        <section className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-4 py-3.5 sm:px-5 sm:py-4">
          <h2 className="text-xs font-semibold text-zinc-700">Match details</h2>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-600 sm:text-sm">
            <p>
              Shown for your search in <span className="font-medium text-zinc-800">{cat}</span>.
              Exact product, brand, and style can vary — contact this supplier for specifics.
            </p>
            {r.operatorNotes?.trim() && (
              <p className="text-zinc-500">
                See <span className="font-medium text-zinc-700">notes</span> below when available.
              </p>
            )}
          </div>
        </section>

        {r.operatorNotes?.trim() && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Notes from supplier</h2>
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3.5 text-sm leading-relaxed text-zinc-800 shadow-sm sm:px-5 sm:py-4">
              <p className="whitespace-pre-wrap">{r.operatorNotes}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
