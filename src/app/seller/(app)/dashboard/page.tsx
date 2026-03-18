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

/** Conversation from /api/seller/messages/conversations (same as messages page) */
interface SellerConversation {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string | null;
  rfqId: string | null;
  rfqNumber: string | null;
  rfqTitle: string | null;
  materialRequestId: string | null;
  contextLabel: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

type BidStatus = "SUBMITTED" | "WON";

function SellerDashboardPageInner() {
  // ALWAYS call all hooks unconditionally at the top level
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth(); // NEW FOUNDATION: Server is source of truth
  
  const [bids, setBids] = useState<Bid[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<SellerConversation[]>([]);
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

        // Load messages from API (legacy RFQ messages, for bid unread counts)
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

        // Load conversations (same source as seller messages page)
        const convRes = await fetch("/api/seller/messages/conversations", {
          cache: "no-store",
          credentials: "include",
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          const list = convData?.conversations ?? [];
          setConversations(Array.isArray(list) ? list : []);
        } else {
          setConversations([]);
        }
      } catch (error) {
        console.error("Error loading seller dashboard data:", error);
        setBids([]);
        setMessages([]);
        setConversations([]);
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

  const formatConversationTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  const openBidsCount = bids.filter((b) => b.status === "SUBMITTED").length;
  const wonBidsCount = bids.filter((b) => b.status === "WON").length;
  const activeConversationsCount = conversations.length;
  const awaitingReplyCount = conversations.filter((c) => c.unreadCount > 0).length;
  const conversationsNeedingAttention = [...conversations]
    .sort((a, b) => {
      const aUnread = a.unreadCount > 0 ? 0 : 1;
      const bUnread = b.unreadCount > 0 ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    })
    .slice(0, 10);

  return (
    <AppShell role="seller" active="dashboard">
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
                  Dashboard
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Active requests and conversations with buyers
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/seller/messages">
                  <Button variant="primary" size="md">
                    Messages
                  </Button>
                </Link>
                <Link href="/seller/scorecard">
                  <Button variant="outline" size="md">
                    Scorecard
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
            <Link href="/seller/messages">
              <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer h-full">
                <CardContent className="p-6">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    Active Conversations
                  </p>
                  <p className="text-3xl font-bold text-black dark:text-zinc-50">
                    {activeConversationsCount}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    Buyer conversations
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/seller/messages">
              <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Awaiting Reply
                    </p>
                    {awaitingReplyCount > 0 && (
                      <Badge variant="warning" className="text-xs">
                        {awaitingReplyCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-black dark:text-zinc-50">
                    {awaitingReplyCount}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    Unread messages
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  Open Bids
                </p>
                <p className="text-3xl font-bold text-black dark:text-zinc-50">
                  {openBidsCount}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                  Won: {wonBidsCount}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Conversations needing attention / Recent activity */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
              Conversations
            </h2>
            {conversationsNeedingAttention.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    No conversations yet
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
                    When buyers send requests or message you, they will appear here
                  </p>
                  <Link href="/seller/messages" className="inline-block mt-4">
                    <Button variant="outline" size="sm">
                      Go to Messages
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {conversationsNeedingAttention.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/seller/messages?conversationId=${conv.id}`}
                    className="block"
                  >
                    <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-black dark:text-zinc-50">
                                {conv.buyerName}
                              </span>
                              {conv.unreadCount > 0 && (
                                <Badge variant="warning" className="text-xs">
                                  {conv.unreadCount} unread
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                              {conv.contextLabel}
                            </p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
                              {conv.lastMessagePreview}
                            </p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                              {formatConversationTime(conv.lastMessageAt)}
                            </p>
                          </div>
                          <span className="text-zinc-400 dark:text-zinc-500 shrink-0">→</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Submitted / Won bids - secondary */}
          {(openBidsCount > 0 || wonBidsCount > 0) && (
            <>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BidStatus)} className="mb-4">
                <TabsList>
                  <TabsTrigger value="SUBMITTED">
                    Submitted ({openBidsCount})
                  </TabsTrigger>
                  <TabsTrigger value="WON">
                    Won ({wonBidsCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {filteredBids.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-zinc-600 dark:text-zinc-400">
                      No {activeTab.toLowerCase()} bids
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredBids.map((bid) => {
                    const rfq = bid.rfq;
                    const total = calculateBidTotal(bid);
                    const unreadMessages = getUnreadMessageCount(bid.rfqId);
                    const statusVariant =
                      bid.status === "WON" ? "success" : bid.status === "SUBMITTED" ? "info" : "default";
                    return (
                      <Card key={bid.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <Link href={`/seller/rfqs/${bid.rfqId}`} className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="font-semibold text-black dark:text-zinc-50">
                                  {rfq ? rfq.rfqNumber : "Unknown RFQ"}
                                </span>
                                <Badge variant={statusVariant}>{bid.status}</Badge>
                                {unreadMessages > 0 && (
                                  <Badge variant="info" className="text-xs">
                                    {unreadMessages === 1 ? "New message" : `${unreadMessages} messages`}
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
                              href={`/seller/rfqs/${bid.rfqId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="ml-4"
                            >
                              <Button variant="outline" size="sm">
                                View RFQ
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
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
