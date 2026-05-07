import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MapPin, Phone } from "lucide-react";
import { getPrisma } from "@/lib/db.rsc";
import { categoryIdToLabel } from "@/lib/categoryIds";
import { searchCapabilities } from "@/lib/search/capabilitySearch";
import { getSearchMode } from "@/lib/search/getSearchMode";
import { findSupplierSearchAdapter } from "@/lib/suppliers/registry";
import type { SupplierProductResult } from "@/lib/suppliers/types";

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
    q?: string;
    listingTitle?: string;
    listingImage?: string;
    listingPrice?: string;
    listingUrl?: string;
  }>;
}) {
  const { requestId: rawRequestId, supplierId: rawSupplierId } = await params;
  const requestId = rawRequestId?.trim() ?? "";
  const supplierId = rawSupplierId?.trim() ?? "";

  const resolvedSearchParams =
    searchParams != null ? await searchParams : undefined;
  const queryOverride =
    typeof resolvedSearchParams?.q === "string" &&
    resolvedSearchParams.q.trim().length > 0
      ? resolvedSearchParams.q.trim()
      : null;

  const listingTitle =
    typeof resolvedSearchParams?.listingTitle === "string" &&
    resolvedSearchParams.listingTitle.trim().length > 0
      ? resolvedSearchParams.listingTitle.trim()
      : null;

  const listingImage =
    typeof resolvedSearchParams?.listingImage === "string" &&
    resolvedSearchParams.listingImage.trim().length > 0
      ? resolvedSearchParams.listingImage.trim()
      : null;

  const listingPrice =
    typeof resolvedSearchParams?.listingPrice === "string" &&
    resolvedSearchParams.listingPrice.trim().length > 0
      ? resolvedSearchParams.listingPrice.trim()
      : null;

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

  const activeQuery =
    (queryOverride || materialRequest.requestText || "").trim();

  const capabilityMatches = await searchCapabilities(activeQuery);

  const mode = listingTitle ? "EXACT" : getSearchMode(activeQuery, capabilityMatches);

  const selected = materialRequest.recipients.find((r) => r.supplierId === supplierId);
  if (!selected) {
    notFound();
  }

  const supplierDomain = selected.supplier.domain ?? null;

  let automatedProductResults: SupplierProductResult[] = [];

  const adapter = findSupplierSearchAdapter(supplierId);

  if (adapter) {
    automatedProductResults = (await adapter.search(activeQuery)).filter(
      (p) => p.supplierId === supplierId,
    );
  } else if (supplierDomain) {
    const { searchSupplierSite } = await import("@/lib/suppliers/searchSupplierSite");

    automatedProductResults = await searchSupplierSite({
      query: activeQuery,
      domain: supplierDomain,
      supplierIds: [supplierId],
      source: "GENERIC",
      logLabel: selected.supplier.name || "Supplier",
    });
  }

  const automatedProduct = automatedProductResults[0] ?? null;

  const hasAutomatedListings = automatedProductResults.length > 0;

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
  const avail = availabilitySummary(r);
  const checking = avail === "Checking";

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

  const normalizedRequestText =
    (queryOverride || materialRequest.requestText).trim() || cat;
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

  const imageSrc =
    listingImage ||
    automatedProduct?.imageUrl ||
    "/placeholder.png";
  if (!imageSrc) return null;

  const productPriceDisplay =
    listingPrice ?? automatedProduct?.price ?? priceDisplay;

  const productStatusLabel = hasAutomatedListings
    ? "In stock"
    : checking
      ? "Checking inventory"
      : avail === "In stock"
        ? "Verified available"
        : "Out of stock";

  const broadProductOptions =
    automatedProductResults.length > 0
      ? automatedProductResults.slice(0, 6)
      : capabilityMatches.length > 0
        ? capabilityMatches.slice(0, 4).map((m) => {
            const parts = [
              m.brand,
              m.subcategory,
            ].filter(Boolean);

            const title = parts.join(" ");

            return {
              title,
              imageUrl: null,
              imageQuery: title,
              price: null,
              productUrl: null,
            };
          })
        : [
            {
              title: baseProductTitle,
              imageUrl: null,
              imageQuery: baseProductTitle,
              price: null,
              productUrl: null,
            },
          ];

  const responseSubtleVal = checking ? "text-sm text-zinc-600" : "text-sm font-medium text-zinc-800";

  const telDigits = r.phone?.replace(/[^\d+]/g, "") ?? "";
  const telHref = telDigits.length > 0 ? `tel:${telDigits}` : null;
  const mapsQuery = addressLine;
  const directionsHref =
    mapsQuery && mapsQuery.length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
      : null;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-5 pb-12 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
        <p className="text-xs leading-relaxed text-zinc-500 sm:text-sm">
          Result for: &quot;{materialRequest.requestText.trim() || "—"}&quot;
        </p>

        {/* Hero — expanded supplier card */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                {r.logoUrl ? (
                  <img
                    src={r.logoUrl}
                    alt={r.supplierName}
                    className="max-h-12 max-w-[96px] object-contain"
                  />
                ) : (
                  <span className="text-base font-semibold text-zinc-500">
                    {r.supplierName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
                  {r.supplierName}
                </h1>
                <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
                  <span>{cat}</span>
                  {r.distanceMiles != null && (
                    <>
                      <span className="mx-1.5 text-zinc-300" aria-hidden>
                        ·
                      </span>
                      <span className="text-zinc-400">
                        {r.distanceMiles.toFixed(1)} mi away
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="shrink-0 sm:pt-0.5">
              <span
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
                  hasAutomatedListings
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : statusBadgeClasses(r.status)
                }`}
              >
                {hasAutomatedListings ? "In stock" : statusBadgeLabel(r.status)}
              </span>
            </div>
          </div>

          <div className="mt-4 border-t border-zinc-100 pt-4">
            <div className="grid gap-3 text-xs text-zinc-600 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-2 sm:text-sm">
              <div className="flex min-w-0 gap-2 sm:col-span-2">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                <p className="min-w-0 leading-snug">
                  <span className="text-zinc-400">Phone </span>
                  <span className="font-medium text-zinc-800">
                    {r.phone?.trim() || "—"}
                  </span>
                </p>
              </div>
              <div className="flex min-w-0 gap-2 sm:col-span-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                <p className="min-w-0 leading-snug break-words">
                  <span className="text-zinc-400">Address </span>
                  <span className="font-medium text-zinc-800">
                    {addressLine || "—"}
                  </span>
                </p>
              </div>
              <div className="flex min-w-0 gap-2 sm:col-span-2">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                <p className="min-w-0 whitespace-pre-wrap leading-snug">
                  <span className="text-zinc-400">Hours </span>
                  <span className="font-medium text-zinc-800">
                    {r.hoursText?.trim() || "—"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {(telHref || directionsHref) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              {telHref && (
                <a
                  href={telHref}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-100 sm:text-sm"
                >
                  Call
                </a>
              )}
              {directionsHref && (
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-100 sm:text-sm"
                >
                  Directions
                </a>
              )}
            </div>
          )}
        </section>

        {/* Main answer */}
        <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
          <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">
            {mode === "EXACT" ? "Best match for your search" : "Available options"}
          </h2>

          {mode !== "EXACT" && (
            <p className="mt-1 text-sm text-zinc-500">
              Showing product options based on your search
            </p>
          )}

          {mode === "EXACT" && (
            <p className="mt-1 text-sm text-zinc-500">
              Showing the closest match to your exact request
            </p>
          )}

          {mode !== "EXACT" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {broadProductOptions.map((opt, i) => (
                <Link
                  key={i}
                  href={`/request/${materialRequest.id}/supplier/${supplierId}?q=${encodeURIComponent(opt.title)}`}
                  className="group block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                >
                  {(() => {
                    const optRow = opt as {
                      title: string;
                      imageUrl?: string | null;
                      imageQuery?: string;
                    };
                    const imageSrc =
                      optRow.imageUrl ||
                      (optRow.imageQuery
                        ? `https://source.unsplash.com/featured/?${encodeURIComponent(optRow.imageQuery)}`
                        : "/placeholder.png");
                    if (!imageSrc) return null;
                    return (
                  <div className="mb-3 flex h-28 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-xs text-zinc-500">
                    <img
                      src={imageSrc}
                      alt={opt.title}
                      className="h-full w-full object-contain"
                    />
                  </div>
                    );
                  })()}

                  <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">
                    {opt.title}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {productStatusLabel}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {opt.productUrl ? "Available online" : "Broad match"}
                    </span>
                  </div>

                  <div className="mt-3 text-sm font-medium text-zinc-900">
                    {opt.price ?? priceDisplay}
                  </div>

                  <p className="mt-2 text-xs text-zinc-500">
                    View this option for more detail
                  </p>
                </Link>
              ))}
            </div>
          )}

          {mode === "EXACT" && (
            <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-5">
                <img
                  src={imageSrc}
                  alt={displayProductTitle}
                  className="h-44 w-full rounded-lg object-contain bg-white sm:w-48"
                />

                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-zinc-900">
                    {displayProductTitle}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {productStatusLabel}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      Exact search
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Price</p>
                      <p className="mt-0.5 font-semibold text-zinc-900">{productPriceDisplay}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Quantity</p>
                      <p className="mt-0.5 font-semibold text-zinc-900">{quantityDisplay}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                    {hasAutomatedListings
                      ? "Agora found this listing automatically. Store availability may vary."
                      : <>We&apos;re checking this exact item with {r.supplierName}. Pricing and availability update here once verified.</>}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

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
