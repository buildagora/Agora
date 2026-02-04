"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
// Removed getRfqs import - using API instead
import { smartSortRfqs, normalizeRfq, isClosingSoon, type NormalizedRFQ } from "@/lib/rfqSort";
import { type RFQ } from "@/lib/rfqs";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";

// Extended RFQ type with computed dueAt for sorting
type RFQWithDueAt = RFQ & {
  dueAt?: string; // Computed from terms.requestedDate for sorting/closing soon checks
};

/**
 * Map NormalizedRFQ to RFQ with dueAt, ensuring all required fields are present
 */
function normalizedRfqToRfq(normalized: NormalizedRFQ): RFQWithDueAt {
  return {
    id: normalized.id,
    rfqNumber: normalized.rfqNumber,
    status: normalized.status === "EXPIRED" ? "CLOSED" : normalized.status,
    createdAt: normalized.createdAt,
    title: normalized.title,
    notes: (normalized as any).notes || "",
    category: normalized.category,
    dueAt: normalized.dueAt,
    jobNameOrPo: (normalized as any).jobNameOrPo,
    visibility: (normalized as any).visibility,
    targetSupplierIds: (normalized as any).targetSupplierIds,
    lineItems: (normalized as any).lineItems || [],
    terms: (normalized as any).terms || {
      fulfillmentType: "DELIVERY" as const,
      requestedDate: normalized.dueAt || normalized.createdAt,
    },
  };
}

export default function SellerFeedPage() {
  const { user } = useAuth();
  
  // CRITICAL: Safety net - BUYER must NEVER render seller pages
  if (user?.role !== "SELLER") {
    return null;
  }
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rfqs, setRfqs] = useState<RFQWithDueAt[]>([]);
  const [filteredDirectRfqs, setFilteredDirectRfqs] = useState<RFQWithDueAt[]>([]);
  const [filteredBroadcastRfqs, setFilteredBroadcastRfqs] = useState<RFQWithDueAt[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedFulfillment, setSelectedFulfillment] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Initialize category from URL query parameter
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
  }, [searchParams]);

  useEffect(() => {
    // Load RFQs from API (server is source of truth)
    // CRITICAL: Never cache seller feed - always fetch fresh data
    // CRITICAL: Only fetch broadcast RFQs for Live Feed
    const loadRFQs = async () => {
      try {
        const res = await fetch("/api/seller/rfqs?visibility=broadcast", {
          credentials: "include",
          cache: "no-store", // Never cache seller feed
        });
        if (res.ok) {
          const rfqData = await res.json();
          const allRFQs = rfqData.ok ? rfqData.data : rfqData;
          // Normalize RFQs (API already filters by visibility=broadcast and category)
          const normalized = (Array.isArray(allRFQs) ? allRFQs : []).map(normalizeRfq);
          // API already returns only OPEN RFQs, but filter again for safety
          const openRFQs = normalized.filter((rfq) => rfq.status === "OPEN");
          
          // Map NormalizedRFQ to local RFQ type
          // CRITICAL: API already filtered to broadcast only, so all RFQs here are broadcast
          const broadcastRFQs = openRFQs.map(normalizedRfqToRfq);
          
          // Store broadcast RFQs only (Live Feed)
          setRfqs(broadcastRFQs);
          
          // V1 FIX: Diagnostic log for RFQ source
          if (process.env.NODE_ENV === "development") {
            console.log("🔍 SELLER_RFQ_SOURCE (Live Feed - Broadcast Only)", {
              broadcast: broadcastRFQs.length,
              source: "api?visibility=broadcast",
            });
          }
        }
      } catch (error) {
        console.error("Error loading RFQs:", error);
        setRfqs([]);
      }
    };
    
    loadRFQs();
  }, []);

  // Apply filters to broadcast RFQs (Live Feed only)
  useEffect(() => {
    // CRITICAL: All RFQs in state are already broadcast (from API filter)
    // No need to split - just filter and sort
    let filtered = rfqs;

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter((rfq) => rfq.category === selectedCategory);
    }

    // Fulfillment type filter
    if (selectedFulfillment) {
      filtered = filtered.filter((rfq) => rfq.terms.fulfillmentType === selectedFulfillment);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (rfq) =>
          rfq.title.toLowerCase().includes(query) ||
          rfq.rfqNumber.toLowerCase().includes(query) ||
          (rfq.jobNameOrPo && rfq.jobNameOrPo.toLowerCase().includes(query))
      );
    }

    // Apply smart sort to filtered RFQs
    const sortedNormalized = smartSortRfqs(filtered);
    const sorted = sortedNormalized.map(normalizedRfqToRfq);
    
    // Live Feed only shows broadcast RFQs
    setFilteredBroadcastRfqs(sorted);
    setFilteredDirectRfqs([]); // No direct RFQs in Live Feed
  }, [rfqs, selectedCategory, selectedFulfillment, searchQuery]);

  // Get unique categories for filter
  const categories = Array.from(new Set(rfqs.map((rfq) => rfq.category))).sort();

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              RFQ Feed
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Browse open requests and submit quotes
            </p>
          </div>

          {/* Filters Row */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Category Filter */}
                <div>
                  <label htmlFor="category-filter" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Category
                  </label>
                  <select
                    id="category-filter"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                  >
                    <option value="">All Categories</option>
                    {categories.map((category, i) => (
                      <option key={`${category}-${i}`} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fulfillment Type Filter */}
                <div>
                  <label htmlFor="fulfillment-filter" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Fulfillment Type
                  </label>
                  <select
                    id="fulfillment-filter"
                    value={selectedFulfillment}
                    onChange={(e) => setSelectedFulfillment(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                  >
                    <option value="">All Types</option>
                    <option value="DELIVERY">Delivery</option>
                    <option value="PICKUP">Pickup</option>
                  </select>
                </div>

                {/* Search */}
                <div>
                  <label htmlFor="search" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Search
                  </label>
                  <input
                    id="search"
                    type="text"
                    placeholder="Search by title or RFQ #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Feed (Broadcast) Section */}
          <div>
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
              Live Feed (Reverse Auction)
            </h2>
            {filteredBroadcastRfqs.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    No open RFQs available.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredBroadcastRfqs.map((rfq) => {
                // Debug: catch missing ids immediately
                const rfqId = rfq?.id;
                if (!rfqId) {
                  console.error("🔴 RFQ missing id", rfq);
                  return null;
                }
                
                return (
                <Card key={rfqId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <Link href={`/seller/rfqs/${rfqId}`} prefetch={false} className="flex-1 min-w-0">
                        {/* V1 FIX: Job Name/PO as primary, RFQ ID as secondary */}
                        <h3 className="text-lg font-medium text-black dark:text-zinc-50 mb-1">
                          {rfq.jobNameOrPo || rfq.title}
                        </h3>
                        {rfq.jobNameOrPo && rfq.title && rfq.title !== rfq.jobNameOrPo && (
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                            {rfq.title}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {rfq.rfqNumber}
                          </span>
                          <Badge variant="info">Open</Badge>
                          <Badge variant="default" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                            Reverse Auction
                          </Badge>
                          {rfq.dueAt && isClosingSoon(rfq.dueAt, new Date()) && (
                            <Badge variant="warning">Closing soon</Badge>
                          )}
                          <Badge variant="default">{rfq.category}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400 flex-wrap">
                          <span>{rfq.lineItems.length} line item(s)</span>
                          <span>•</span>
                          <span className="capitalize">{rfq.terms.fulfillmentType.toLowerCase()}</span>
                          <span>•</span>
                          <span>
                            {rfq.terms.fulfillmentType === "PICKUP" ? "Pickup" : "Delivery"}: {formatDateShort(rfq.terms.requestedDate)}
                          </span>
                        </div>
                      </Link>
                      <div className="ml-4">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          type="button"
                          onClick={() => {
                            console.log("NAV_RFQ", rfqId);
                            router.push(`/seller/rfqs/${rfqId}`);
                          }}
                          disabled={!rfqId}
                        >
                          View Details →
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>
  );
}

