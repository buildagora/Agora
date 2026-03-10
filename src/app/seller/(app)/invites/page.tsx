"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// Removed unused useSearchParams import
// Removed getRfqs import - using API instead
import { getCurrentSupplierId } from "@/lib/sellerIdentity";
import { smartSortRfqs, normalizeRfq } from "@/lib/rfqSort";
import type { NormalizedRFQ } from "@/lib/rfqSort";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";

// Use canonical RFQ type from @/lib/rfqs

export default function SellerInvitesPage() {
  const { user } = useAuth();
  
  // CRITICAL: All hooks must be called unconditionally (Rules of Hooks)
  const router = useRouter();
  const [rfqs, setRfqs] = useState<NormalizedRFQ[]>([]);
  const [filteredRfqs, setFilteredRfqs] = useState<NormalizedRFQ[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedFulfillment, setSelectedFulfillment] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Check if user is seller (used for guards and render gate)
  const isSeller = user?.role === "SELLER";

  useEffect(() => {
    // Guard: Only fetch if user is a seller
    if (!isSeller) {
      return;
    }

    // Load RFQs from API (server is source of truth)
    // CRITICAL: Only fetch direct RFQs for Direct Invites page
    const loadRFQs = async () => {
      try {
        const res = await fetch("/api/seller/rfqs?visibility=direct", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const rfqData = await res.json();
          const allRFQs = rfqData.ok ? rfqData.data : rfqData;
          const rfqsArray = Array.isArray(allRFQs) ? allRFQs : [];
          
          // Normalize and filter to open/active RFQs only
          const normalized = rfqsArray.map(normalizeRfq);
          const openRFQs = normalized.filter((rfq) => rfq.status === "OPEN");
          
          // CRITICAL: API already filtered to visibility=direct, so all RFQs here are direct
          const directRFQs = openRFQs.map((rfq) => {
            // Map NormalizedRFQ to RFQ type
            return {
              id: rfq.id,
              rfqNumber: rfq.rfqNumber,
              status: rfq.status === "EXPIRED" ? "CLOSED" : rfq.status,
              createdAt: rfq.createdAt,
              title: rfq.title,
              notes: (rfq as any).notes || "",
              category: rfq.category,
              dueAt: rfq.dueAt,
              jobNameOrPo: (rfq as any).jobNameOrPo,
              visibility: (rfq as any).visibility,
              targetSupplierIds: (rfq as any).targetSupplierIds,
              lineItems: (rfq as any).lineItems || [],
              terms: (rfq as any).terms || {
                fulfillmentType: "DELIVERY" as const,
                requestedDate: rfq.dueAt || rfq.createdAt,
              },
            };
          });
          
          // V1 FIX: Diagnostic log for RFQ source
          if (process.env.NODE_ENV === "development") {
            console.log("🔍 SELLER_RFQ_SOURCE (Direct Invites - Direct Only)", {
              rfqsCount: directRFQs.length,
              source: "api?visibility=direct",
            });
          }
          
          setRfqs(directRFQs);
        }
      } catch (error) {
        console.error("Error loading RFQs:", error);
        setRfqs([]);
      }
    };
    
    loadRFQs();
  }, [isSeller]);

  // Apply filters
  useEffect(() => {
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
    const sorted = smartSortRfqs(filtered);
    setFilteredRfqs(sorted);
  }, [rfqs, selectedCategory, selectedFulfillment, searchQuery]);

  // Get unique categories for filter
  const categories = Array.from(new Set(rfqs.map((rfq) => rfq.category))).sort();

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Render gate: AFTER all hooks are called
  // If auth is still loading or user is undefined, show loading state
  if (!user) {
    return (
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If user exists but is not a seller, redirect to switch role
  if (!isSeller) {
    router.replace("/auth/switch-role?role=seller");
    return null;
  }

  return (
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Direct Invites
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              RFQs sent directly to you by buyers
            </p>
          </div>

          {/* Filters Row */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    {categories.map((cat, i) => (
                      <option key={`${cat}-${i}`} value={cat}>
                        {cat}
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
              </div>
            </CardContent>
          </Card>

          {/* RFQs List */}
          {filteredRfqs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  {rfqs.length === 0
                    ? "No direct invites at this time."
                    : "No RFQs match your filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredRfqs.map((rfq) => {
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
                        <Button variant="outline" size="sm" asChild type="button">
                          <Link href={`/seller/rfqs/${rfqId}`} prefetch={false}>
                            View Details →
                          </Link>
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
  );
}

