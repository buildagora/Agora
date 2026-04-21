"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Card, { CardContent } from "@/components/ui2/Card";
import RecentSearchesDrawer from "@/components/layout/RecentSearchesDrawer";
import RecentSearchesSidebar from "@/components/layout/RecentSearchesSidebar";
import SiteHeader from "@/components/layout/SiteHeader";
import { useIsMobileMd } from "@/hooks/useIsMobileMd";
import { categoryIdToLabel } from "@/lib/categoryIds";
import {
  Boxes,
  CheckCircle,
  Clock,
  DollarSign,
  Loader2,
  MapPin,
  Package,
  Phone,
  Timer,
  Truck,
  XCircle,
} from "lucide-react";

interface Request {
  id: string;
  categoryId: string;
  requestText: string;
  sendMode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  fulfilledAt: string | null;
  /** Buyer / material request location for context line (optional). */
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Recipient {
  supplierId: string;
  supplierName: string;
  conversationId: string;
  status: string;
  sentAt: string;
  viewedAt: string | null;
  respondedAt: string | null;
  conversationUpdatedAt: string;
  operatorNotes: string | null;
  address: string;
  phone: string | null;
  logoUrl: string | null;
  hoursText: string | null;
  availabilityStatus: string | null;
  quantityAvailable: number | null;
  quantityUnit: string | null;
  price: number | null;
  priceUnit: string | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  deliveryEta: string | null;
  distanceMiles: number | null;
}

interface Recipients {
  replied: Recipient[];
  pending: Recipient[];
  closedOut: Recipient[];
}

interface MaterialRequestDetailClientProps {
  request: Request;
  recipients: Recipients;
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function locationContextLine(request: Request): string | null {
  const city = request.locationCity?.trim();
  const region = request.locationRegion?.trim();
  if (city && region) {
    return `Showing results from suppliers near ${city}, ${region}`;
  }
  if (city) {
    return `Showing results from suppliers near ${city}`;
  }
  if (region) {
    return `Showing results from suppliers near ${region}`;
  }
  const country = request.locationCountry?.trim();
  if (country) {
    return `Showing results from suppliers near ${country}`;
  }
  return null;
}

/** Friendly subtitle for supplier cards (e.g. “Roofing Supply”) from request category. */
function supplierCardCategoryLabel(request: Request): string {
  const raw = request.categoryId?.trim().toLowerCase();
  if (!raw) return "Supplier";
  if (raw in categoryIdToLabel) {
    return `${categoryIdToLabel[raw as keyof typeof categoryIdToLabel]} Supply`;
  }
  const titled = raw
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${titled} Supply`;
}

function getRecipientStatusLabel(status: string): string {
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

function recipientStatusBadge(status: string) {
  const colors: Record<string, string> = {
    REPLIED: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    SENT: "bg-amber-50 text-amber-800 border border-amber-200",
    VIEWED: "bg-amber-50 text-amber-800 border border-amber-200",
    OUT_OF_STOCK: "bg-orange-50 text-orange-800 border border-orange-200",
    NO_RESPONSE: "bg-zinc-50 text-zinc-600 border border-zinc-200",
    DECLINED: "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
        colors[status] || "bg-zinc-50 text-zinc-600 border border-zinc-200"
      }`}
    >
      {getRecipientStatusLabel(status)}
    </span>
  );
}

function SupplierRow({
  recipient,
  timeValue,
  requestText,
  categoryLabel,
}: {
  recipient: Recipient;
  timeValue: string;
  requestText: string;
  categoryLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-6 shadow-sm">
      {/* 1. Business identity */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-1 items-center gap-4 min-w-0">
          <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
            {recipient.logoUrl ? (
              <img
                src={recipient.logoUrl}
                alt={recipient.supplierName}
                className="max-h-12 max-w-[96px] object-contain"
              />
            ) : (
              <div className="flex h-16 w-28 items-center justify-center rounded-xl bg-zinc-100 text-base font-semibold text-zinc-600">
                {recipient.supplierName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="truncate text-lg font-semibold leading-tight text-zinc-900">
              {recipient.supplierName}
            </h3>
            <p className="truncate text-xs leading-snug text-zinc-500">
              <span>{categoryLabel}</span>
              {recipient.distanceMiles != null && (
                <>
                  <span className="mx-1.5 select-none text-zinc-400" aria-hidden>
                    •
                  </span>
                  <span>{recipient.distanceMiles.toFixed(1)} miles away</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="shrink-0 self-start pt-0.5">
          {recipientStatusBadge(recipient.status)}
        </div>
      </div>

      {/* 2. Supplier details */}
      <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-sm text-zinc-600">
        {recipient.address && recipient.address.replace(/[, ]+/g, "").length > 0 && (
          <p className="flex items-start gap-2 leading-snug">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <span>{recipient.address}</span>
          </p>
        )}
        {recipient.phone && (
          <p className="flex items-center gap-2 leading-snug">
            <Phone className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <span>{recipient.phone}</span>
          </p>
        )}
        {recipient.hoursText && (
          <p className="mt-1 flex items-start gap-2 text-sm text-zinc-600">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <span>{recipient.hoursText}</span>
          </p>
        )}
        <p className="text-xs text-zinc-500">Checked by Agora • {timeValue}</p>
      </div>

      {/* 3. Search answer (single divider, no nested panel) */}
      <div className="mt-3 border-t border-zinc-200 pt-3">
        <p className="mb-3 text-xs text-zinc-500">
          RESULT FOR: &quot;{requestText}&quot;
        </p>

        <div className="space-y-1.5 text-sm text-zinc-800">
          {(recipient.availabilityStatus === "IN_STOCK" || recipient.status === "REPLIED") && (
            <p className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <span>In Stock</span>
            </p>
          )}
          {(recipient.availabilityStatus === "OUT_OF_STOCK" || recipient.status === "OUT_OF_STOCK") && (
            <p className="flex items-center gap-2 font-medium text-orange-700">
              <XCircle className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
              <span>Out of Stock</span>
            </p>
          )}
          {(recipient.availabilityStatus === "CHECKING" ||
            recipient.status === "SENT" ||
            recipient.status === "VIEWED") && (
            <p className="flex items-center gap-2 font-medium text-amber-700">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-600" aria-hidden />
              <span>Checking availability...</span>
            </p>
          )}

          {recipient.quantityAvailable && recipient.quantityUnit && (
            <p className="flex items-center gap-2 text-zinc-700">
              <Boxes className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span>
                {recipient.quantityAvailable} {recipient.quantityUnit}
              </span>
            </p>
          )}
          {recipient.price && recipient.priceUnit && (
            <p className="flex items-center gap-2 text-zinc-700">
              <DollarSign className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span>
                ${recipient.price} / {recipient.priceUnit}
              </span>
            </p>
          )}
          {recipient.pickupAvailable !== null && (
            <p className="flex items-center gap-2 text-zinc-700">
              <Package className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span>Pickup: {recipient.pickupAvailable ? "Available" : "Not available"}</span>
            </p>
          )}
          {recipient.deliveryAvailable !== null && (
            <p className="flex items-center gap-2 text-zinc-700">
              <Truck className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span>Delivery: {recipient.deliveryAvailable ? "Available" : "Not available"}</span>
            </p>
          )}
          {recipient.deliveryEta && (
            <p className="flex items-center gap-2 text-zinc-700">
              <Timer className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span>ETA: {recipient.deliveryEta}</span>
            </p>
          )}
          {recipient.operatorNotes && (
            <p className="mt-2 text-xs whitespace-pre-wrap text-zinc-500">
              {recipient.operatorNotes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MaterialRequestDetailClient({
  request,
  recipients,
}: MaterialRequestDetailClientProps) {
  const pathname = usePathname();
  const isBuyerApp = pathname?.startsWith("/buyer") ?? false;
  const showDesktopSidebar = !isBuyerApp;
  const isMobile = useIsMobileMd();

  const [searchQuery, setSearchQuery] = useState(() => request.requestText.trim());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const totalRecipients =
    recipients.replied.length + recipients.pending.length + recipients.closedOut.length;

  const allRecipients = [
    ...recipients.replied,
    ...recipients.pending,
    ...recipients.closedOut,
  ];

  const persistedRequestText = request.requestText.trim() || "Your search";
  const locationLine = locationContextLine(request);
  const cardCategoryLabel = supplierCardCategoryLabel(request);

  const handleShareLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedLink(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopiedLink(false);
        copyResetRef.current = null;
      }, 1500);
    });
  };

  const mainColumn = (
    <>
      {/* Search-first header — aligned with main site content column */}
      <header className="space-y-2 sm:space-y-2.5">
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleShareLink}
              className={`text-sm rounded-md border px-3 py-1.5 transition-colors ${
                copiedLink
                  ? "border-emerald-200 bg-emerald-50/90 text-emerald-900"
                  : "border-zinc-200 hover:bg-zinc-50"
              }`}
              aria-live="polite"
            >
              {copiedLink ? "Copied" : "Share"}
            </button>
          </div>

          <div className="w-full">
            <label htmlFor="material-request-search" className="sr-only">
              Search materials
            </label>
            <div className="mb-4 flex w-full min-w-0 items-center rounded-full border border-zinc-200 bg-white py-2.5 pl-4 pr-2 shadow-sm transition-shadow hover:shadow-md sm:mb-5 sm:py-3 sm:pl-5">
              <input
                id="material-request-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="What are you looking for?"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400 sm:text-[17px]"
              />
              <div className="mx-2 h-6 w-px shrink-0 self-center bg-zinc-200" aria-hidden />
              <div
                className="flex shrink-0 items-center justify-center rounded-full p-2 text-zinc-400"
                aria-hidden
              >
                <SearchGlyph className="h-5 w-5" />
              </div>
            </div>
            <div
              role="status"
              aria-live="polite"
              className="mt-3 mb-6 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 sm:mb-7 sm:gap-3.5 sm:px-4 sm:py-3"
            >
              <Loader2
                className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-emerald-600/90"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-semibold leading-snug text-zinc-800">
                  Checking live availability and pricing from nearby suppliers
                </p>
                <p className="text-xs leading-relaxed text-zinc-500">
                  Results update in real time as suppliers respond.
                </p>
              </div>
            </div>
          </div>

          {locationLine && (
            <p className="text-sm text-zinc-500">{locationLine}</p>
          )}
        </header>

        {allRecipients.length > 0 && (
          <div className="mt-6 sm:mt-7">
            <Card>
              <CardContent className="p-4">
                <div className="space-y-4">
                  {allRecipients.map((recipient) => (
                    <SupplierRow
                      key={recipient.conversationId}
                      recipient={recipient}
                      timeValue={formatRelativeTime(
                        recipient.respondedAt || recipient.conversationUpdatedAt
                      )}
                      requestText={persistedRequestText}
                      categoryLabel={cardCategoryLabel}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {totalRecipients === 0 && (
          <div className="mt-6 sm:mt-7">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-zinc-500">
                  No supplier results yet.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
    </>
  );

  return (
    <div
      className={
        isBuyerApp ? "w-full min-h-0" : "flex min-h-screen flex-col bg-white"
      }
    >
      {showDesktopSidebar && (
        <>
          <SiteHeader
            drawerOpen={drawerOpen}
            onDrawerOpenChange={setDrawerOpen}
          />
          {isMobile && (
            <RecentSearchesDrawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />
          )}
        </>
      )}

      {isBuyerApp ? (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {mainColumn}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {drawerOpen && (
            <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 md:block md:self-stretch">
              <RecentSearchesSidebar />
            </aside>
          )}
          <div className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
              {mainColumn}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
