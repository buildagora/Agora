"use client";

// FOUNDATION RULE:
// This page must only consume data from API routes backed by Prisma.
// No client-side state, localStorage, or inferred users allowed.
// All KPIs must be either:
//   - API-backed (from /api/seller/* endpoints)
//   - Explicitly empty with TODO until API exists
// No inferred data. No client synthesis.

import { Suspense } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import Tooltip from "@/components/ui2/Tooltip";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import Tabs, { TabsList, TabsTrigger } from "@/components/ui2/Tabs";
import AppShell from "@/components/ui2/AppShell";

interface LineItem {
  description: string;
  unit: string;
  quantity: number;
}

interface RFQ {
  id: string;
  rfqNumber: string;
  status: "OPEN" | "AWARDED" | "CLOSED";
  createdAt: string;
  title: string;
  notes: string;
  lineItems: LineItem[];
  terms: {
    fulfillmentType: "PICKUP" | "DELIVERY";
    requestedDate: string;
    deliveryPreference?: "MORNING" | "ANYTIME";
    deliveryInstructions?: string;
    location?: string; // Only present for DELIVERY
  };
}

interface BidLineItem {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

interface Bid {
  id: string;
  rfqId: string;
  createdAt: string;
  sellerName: string;
  lineItems: BidLineItem[];
  notes: string;
  status?: "SUBMITTED" | "WON" | "LOST";
  seenByBuyerAt?: string | null;
  seenBySellerAt?: string | null;
  // RFQ summary fields (included from bids API)
  rfq?: {
    id: string;
    rfqNumber: string;
    title: string;
    category: string;
    categoryId: string | null;
    jobNameOrPo: string | null;
    status: string;
  } | null;
}

interface Message {
  id: string;
  rfqId: string;
  fromRole: "BUYER" | "SELLER";
  seenBySellerAt?: string | null;
}

type BidStatus = "SUBMITTED" | "WON";

function SellerDashboardPageInner() {
  // ALWAYS call all hooks unconditionally at the top level
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth(); // NEW FOUNDATION: Server is source of truth
  
  // All state hooks must be called unconditionally
  const [bids, setBids] = useState<Bid[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  // Action queue removed - will be added when API route exists
  const [activeTab, setActiveTab] = useState<BidStatus>("SUBMITTED");
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  // Removed markedSeenTabs - seen/unseen logic disabled until API supports it

  // useEffect MUST be called unconditionally (before any early returns)
  // Guards are INSIDE the effect, not around it
  useEffect(() => {
    // Guard: Don't run if still loading
    if (status === "loading") {
      return;
    }

    // Guard: Don't load data if not authenticated or wrong role
    if (!user || user.role !== "SELLER") {
      return;
    }

    // Load data function (defined inside effect to avoid dependency issues)
    const loadData = async () => {
      try {
        // Load bids from API (server queries database with RFQ summary included)
        const bidsRes = await fetch("/api/seller/bids", {
          cache: "no-store",
          credentials: "include",
        });
        if (bidsRes.ok) {
          const bidsData = await bidsRes.json();
          const apiBids = Array.isArray(bidsData) ? bidsData : (bidsData.data || []);
          // Default status to SUBMITTED if missing
          const bidsWithStatus = apiBids.map((bid: Bid) => ({
            ...bid,
            status: bid.status || "SUBMITTED",
          }));
          setBids(bidsWithStatus);
        } else {
          setBids([]);
        }

        // Load messages from API
        const messagesRes = await fetch("/api/seller/messages", {
          cache: "no-store",
          credentials: "include",
        });
        if (messagesRes.ok) {
          const messagesData = await messagesRes.json();
          const apiMessages = Array.isArray(messagesData) ? messagesData : (messagesData.data || []);
          setMessages(apiMessages);
        } else {
          setMessages([]);
        }

        // TODO: Load action queue from API when available
      } catch (error) {
        console.error("Error loading seller dashboard data:", error);
        // Gracefully handle errors - show empty state
        setBids([]);
        setMessages([]);
      }
    };

    loadData();

    // Check for success param
    if (searchParams.get("success") === "bid_submitted") {
      setShowSuccessBanner(true);
      // Remove param from URL
      router.replace("/seller/dashboard", { scroll: false });
      // Hide banner after 5 seconds
      setTimeout(() => setShowSuccessBanner(false), 5000);
    }
  }, [searchParams, router, user, status]);

  // Redirect effects - must be in useEffect, not during render
  useEffect(() => {
    if (status === "loading") {
      return; // Don't redirect while loading
    }

    // Redirect if not authenticated
    if (!user) {
      router.replace("/seller/login?returnTo=/seller/dashboard");
      return;
    }

    // CRITICAL: Safety net - BUYER must NEVER render seller pages
    if (user.role !== "SELLER") {
      router.replace("/auth/switch-role?target=SELLER");
      return;
    }
  }, [user, status, router]);
  
  // Gate rendering AFTER all hooks are called
  // Show loading state while auth is being checked
  if (status === "loading") {
    return null; // or <LoadingSpinner /> if you have one
  }
  
  // Show nothing while redirecting
  if (!user || user.role !== "SELLER") {
    return null;
  }

  // TODO: Mark bids as seen when viewing Won tab - removed until API supports seen/unseen
  // The API currently returns placeholder data, so seen/unseen logic is disabled

  // TODO: Unseen wins logic removed until API supports seen/unseen
  // For now, show all won bids (no "new win" badge)

  const getUnreadMessageCount = (rfqId: string): number => {
    return messages.filter(
      (msg) =>
        msg.rfqId === rfqId &&
        msg.fromRole === "BUYER" &&
        (msg.seenBySellerAt === null || msg.seenBySellerAt === undefined)
    ).length;
  };

  const filteredBids = bids.filter((bid) => bid.status === activeTab);

  const calculateBidTotal = (bid: Bid): number => {
    return bid.lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity || "0");
      const price = parseFloat(item.unitPrice || "0");
      return sum + qty * price;
    }, 0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Calculate KPIs from API data only (no client-side inference)
  const openBidsCount = bids.filter((b) => b.status === "SUBMITTED").length;
  const wonBidsCount = bids.filter((b) => b.status === "WON").length;
  
  // TODO: Load active threads from API when /api/seller/messages/threads exists
  // For now, derive from messages API response (proxy until dedicated endpoint)
  const activeThreadsCount = messages.length > 0 ? new Set(messages.map(m => m.rfqId)).size : 0;
  
  // TODO: Calculate needs reply from API when /api/seller/messages/needs-reply exists
  // Empty until API exists - no client-side inference
  const needsReplyCount = 0;
  
  // TODO: Load action queue from /api/seller/action-queue when it exists
  // Empty until API exists
  const actionQueueCount = 0;
  
  // TODO: Load exceptions from /api/seller/exceptions when Order/Exception models exist
  // Empty until API exists
  const exceptionsCount = 0;

  return (
    <AppShell role="seller" active="dashboard">
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
                  Seller Dashboard
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Manage your bids and track active requests
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/seller/scorecard">
                  <Button variant="outline" size="md">
                    View Scorecard
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Success Banner */}
          {showSuccessBanner && (
            <Card className="mb-6 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
              <CardContent className="p-4">
                <p className="text-green-800 dark:text-green-200 font-medium">
                  {searchParams.get("success") === "profile_completed"
                    ? "Profile completed! You'll now receive RFQ notifications for your selected categories."
                    : "Quote sent successfully!"}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Win Banner - Removed until API supports seen/unseen */}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Open Bids
                    </p>
                    <p className="text-3xl font-bold text-black dark:text-zinc-50">
                      {openBidsCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Won
                    </p>
                    <p className="text-3xl font-bold text-black dark:text-zinc-50">
                      {wonBidsCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Link href="/seller/messages">
              <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Active Conversations
                        </p>
                        <Tooltip content="Ongoing message conversations with buyers across RFQs. This is not the number of RFQs." />
                      </div>
                      <p className="text-3xl font-bold text-black dark:text-zinc-50">
                        {activeThreadsCount}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Conversations needing attention
                        </p>
                        {needsReplyCount > 0 && (
                          <Badge variant="warning" className="text-xs">
                            {needsReplyCount} needs reply
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Action Queue Section - Removed until API route exists */}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BidStatus)} className="mb-6">
            <TabsList>
              <TabsTrigger value="SUBMITTED">
                Submitted ({bids.filter((b) => b.status === "SUBMITTED").length})
              </TabsTrigger>
              <TabsTrigger value="WON">
                Won ({bids.filter((b) => b.status === "WON").length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Bids List */}
          {filteredBids.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  No {activeTab.toLowerCase()} bids found.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredBids.map((bid) => {
                // Use RFQ summary from bid object (included from bids API)
                const rfq = bid.rfq;
                const total = calculateBidTotal(bid);
                // TODO: Seen/unseen logic removed until API supports it
                const unreadMessages = getUnreadMessageCount(bid.rfqId);
                
                // TODO: Load exceptions from API when Order/Exception models exist
                const hasActiveExceptions = false;

                const statusVariant = 
                  bid.status === "WON" ? "success" :
                  bid.status === "SUBMITTED" ? "info" :
                  "default";

                return (
                  <Card
                    key={bid.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <Link href={`/seller/rfqs/${bid.rfqId}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-semibold text-black dark:text-zinc-50">
                              {rfq ? rfq.rfqNumber : "Unknown RFQ"}
                            </span>
                            <Badge variant={statusVariant}>
                              {bid.status}
                            </Badge>
                            {/* Removed "New win" badge - seen/unseen logic disabled until API supports it */}
                            {unreadMessages > 0 && (
                              <Badge variant="info" className="text-xs">
                                {unreadMessages === 1 ? "New message" : `${unreadMessages} messages`}
                              </Badge>
                            )}
                            {hasActiveExceptions && (
                              <Badge variant="warning" className="text-xs">
                                Needs Attention
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-lg font-medium text-black dark:text-zinc-50 mb-2">
                            {rfq ? rfq.title : "RFQ not found"}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400 flex-wrap">
                            <span>{bid.lineItems.length} line item(s)</span>
                            {total > 0 && (
                              <>
                                <span>•</span>
                                <span className="font-medium">Total: ${total.toFixed(2)}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Submitted {formatDate(bid.createdAt)}</span>
                          </div>
                        </Link>
                        <Link
                          href={`/seller/messages/${bid.rfqId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-4"
                        >
                          <Button variant="outline" size="sm">
                            View Messages
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function SellerDashboardPage() {
  return (
    <Suspense fallback={null}>
      <SellerDashboardPageInner />
    </Suspense>
  );
}
