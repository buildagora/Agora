"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed pushLegacyNotification import - notifications will be created server-side via API
// Removed PO import - PO creation now handled via API
// Removed storage imports - using API calls instead
import MarkNotificationsRead from "@/components/MarkNotificationsRead";
import UnreadBidBadge from "@/components/UnreadBidBadge";
import { generateThreadId, createSystemMessage } from "@/lib/messages";
// DO NOT IMPORT server-only modules here
// Use API routes instead
import { getRequest, rfqToRequest } from "@/lib/request";
import { type RFQ } from "@/lib/rfqs";
import { mapBidsToQuotes } from "@/lib/quote";
import { recommendForRequest, type RecommendationResult } from "@/lib/recommendation";
import { createOrderFromAward, getOrderByRequestId, type Order } from "@/lib/order";
import { detectAllExceptions, type Exception } from "@/lib/exceptionDetection";
import { getSupplierReliabilityTags } from "@/lib/supplierMetrics";
import { listEventsByRequest } from "@/lib/eventLog";
import { useToast } from "@/components/Toast";
import PurchaseOrderActions from "@/components/PurchaseOrderActions";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import Tabs, { TabsList, TabsTrigger, TabsContent } from "@/components/ui2/Tabs";

// Use canonical RFQ type from @/lib/rfqs

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
  sellerDisplayName?: string; // Computed display name from API (companyName > fullName > email)
  sellerId?: string; // Seller who created this bid
  buyerId?: string; // Buyer who owns the RFQ
  lineItems: BidLineItem[];
  notes: string;
  status?: "SUBMITTED" | "WON" | "LOST";
  seenByBuyerAt?: string | null;
  seenBySellerAt?: string | null;
  deliveryCharge?: number;
  total?: number;
  leadTimeDays?: number; // Days until fulfillment (required for ranking)
}

export default function RFQDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const id = params.rfqId as string;
  const [rfq, setRfq] = useState<RFQ | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [conversations, setConversations] = useState<Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    lastMessagePreview: string | null;
    lastMessageAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingBidId, setConfirmingBidId] = useState<string | null>(null);
  const [dispatchedSuppliers, setDispatchedSuppliers] = useState<Array<{ 
    sellerId: string; 
    companyName: string; 
    phase: "primary" | "fallback";
    status: "sent" | "opened" | "responded" | "expired";
  }>>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [previousRecommendedSellerId, setPreviousRecommendedSellerId] = useState<string | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null); // sellerId of expanded breakdown
  const [order, setOrder] = useState<Order | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const { showToast } = useToast();
  const successToastShown = useRef(false);

  // Show premium success notification when RFQ is created
  useEffect(() => {
    const created = searchParams.get("created");
    const rfqNumber = searchParams.get("rfqNumber");

    if (created === "true" && rfqNumber && !successToastShown.current) {
      successToastShown.current = true;

      // Show premium success notification with procurement-focused copy
      showToast({
        type: "success",
        title: "Request submitted",
        message: `RFQ ${rfqNumber} has been sent to matching suppliers.`,
        subtitle: "You can track bids, messages, and updates from this page.",
        duration: 8000, // Longer duration for important success message
      });

      // Clean up query params after showing toast (preserve other params if any)
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete("created");
      newSearchParams.delete("rfqNumber");
      const newSearch = newSearchParams.toString();
      const newPath = newSearch ? `/buyer/rfqs/${id}?${newSearch}` : `/buyer/rfqs/${id}`;
      router.replace(newPath, { scroll: false });
    }
  }, [searchParams, showToast, router]);

  // Helper to get all activity events (from event log + system messages)
  const getActivityEvents = () => {
    if (!rfq) return [];
    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user) return [];

    const events: Array<{
      id: string;
      type: string;
      label: string;
      timestamp: string;
      badge?: string;
    }> = [];

    // Get events from event log
    const eventLogEvents = listEventsByRequest(id);
    eventLogEvents.forEach((event) => {
      let label = "";
      let badge: string | undefined;
      switch (event.type) {
        case "REQUEST_POSTED":
          label = "Request posted";
          break;
        case "BID_SUBMITTED":
          label = "Bid submitted";
          break;
        case "ORDER_AWARDED":
          label = "Order awarded";
          badge = "Awarded";
          break;
        case "ORDER_CONFIRMED":
          label = "Order confirmed";
          badge = "Confirmed";
          break;
        case "ORDER_SCHEDULED":
          label = "Order scheduled";
          badge = "Scheduled";
          break;
        case "ORDER_DELIVERED":
          label = "Order delivered";
          badge = "Delivered";
          break;
        case "ORDER_CANCELLED":
          label = "Order cancelled";
          badge = "Cancelled";
          break;
        default:
          label = event.type.replace(/_/g, " ").toLowerCase();
      }
      events.push({
        id: event.id,
        type: event.type,
        label,
        timestamp: event.at,
        badge,
      });
    });

    // Get system messages from all threads for this RFQ
    // Note: System messages are also logged as events, so we primarily use event log
    // This section can be expanded later if needed for message-specific events

    // Add order status history
    if (order && order.statusHistory && Array.isArray(order.statusHistory)) {
      order.statusHistory.forEach((event) => {
        events.push({
          id: `order-${event.status}-${event.at}`,
          type: `ORDER_${event.status.toUpperCase()}`,
          label: `Order ${event.status}`,
          timestamp: event.at,
          badge: event.status,
        });
      });
    }

    // Add RFQ creation
    if (rfq.createdAt) {
      events.push({
        id: `rfq-created-${rfq.createdAt}`,
        type: "REQUEST_CREATED",
        label: "Request created",
        timestamp: rfq.createdAt,
      });
    }

    // Add award date if exists
    if (rfq.status === "AWARDED" && rfq.awardedAt) {
      events.push({
        id: `rfq-awarded-${rfq.awardedAt}`,
        type: "ORDER_AWARDED",
        label: "Order awarded",
        timestamp: rfq.awardedAt,
        badge: "Awarded",
      });
    }

    // Sort by timestamp (newest first)
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const loadData = async () => {
    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user) {
      setLoading(false);
      return;
    }

    // DATABASE-FIRST: Load RFQ from API (server queries database)
    try {
      const res = await fetch(`/api/buyer/rfqs/${id}`, {
        cache: "no-store",
        credentials: "include", // CRITICAL: Include cookie for auth
      });
      
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const errorData = await res.json().catch(() => ({}));
          console.error("RFQ_FETCH_FAILED", res.status, errorData);
        } else {
          const text = await res.text().catch(() => "");
          console.error("RFQ_FETCH_FAILED", res.status, text);
        }
        setRfq(null);
        setLoading(false);
        return;
      }
      
      // Handle both direct object and { ok: true, data: {...} } formats
      const responseData = await res.json();
      const rfq = responseData.data || responseData;
      
      // DEV-ONLY: Log RFQ detail load
      if (process.env.NODE_ENV === "development") {
        console.log("[RFQ_DETAIL_LOADED]", {
          hasRfq: !!rfq,
          rfqId: rfq?.id || id,
          requestedId: id,
        });
      }
      
      setRfq(rfq);
    } catch (error) {
      console.error("RFQ_FETCH_ERROR", error);
      setRfq(null);
      setLoading(false);
      return;
    }

    // Load RFQ-scoped conversations
    try {
      const conversationsRes = await fetch(`/api/buyer/rfqs/${id}/conversations`, {
        cache: "no-store",
        credentials: "include",
      });
      
      if (conversationsRes.ok) {
        const conversationsData = await conversationsRes.json();
        // Handle both direct array and { ok: true, conversations: [...] } formats
        const conversations = conversationsData.ok 
          ? (conversationsData.conversations || [])
          : (Array.isArray(conversationsData) ? conversationsData : []);
        setConversations(Array.isArray(conversations) ? conversations : []);
      } else {
        setConversations([]);
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
      setConversations([]);
    }

    // Load bids from database API
    try {
      const bidsRes = await fetch(`/api/buyer/bids?rfqId=${id}`, {
        cache: "no-store",
        credentials: "include",
      });
      
      if (bidsRes.ok) {
        const bidsData = await bidsRes.json();
        const bids = bidsData.ok ? bidsData.data : bidsData;
        setBids(Array.isArray(bids) ? bids : []);
      } else {
        setBids([]);
      }
    } catch (error) {
      console.error("Error loading bids:", error);
      setBids([]);
    }
    
    // Dev log
    if (process.env.NODE_ENV === "development") {
      console.log("📋 RFQ_DETAIL_LOADED", {
        rfqId: id,
        hasRfq: !!rfq,
      });
    }

    // Note: Marking notifications as read is handled by MarkNotificationsRead component

    // TODO: Load Order from database API when available
    // For now, gracefully handle no order
    setOrder(null);

    // TODO: Load dispatched suppliers from database API when available
    // For now, gracefully handle empty dispatch records
    const dispatchRecords: any[] = [];
    
    // Compute exceptions for this request
    (async () => {
      try {
        const request = await getRequest(id, user?.id) || (rfq ? rfqToRequest(rfq) : null);
        if (request) {
          const now = new Date().toISOString();
          const detectedExceptions = detectAllExceptions({
            request,
            dispatchRecords,
            order: order || null, // Use order state variable
            now,
          });
          setExceptions(detectedExceptions);
        } else {
          setExceptions([]);
        }
      } catch (error) {
        // Silently fail - exceptions are optional
        if (process.env.NODE_ENV === "development") {
          console.error("Error detecting exceptions:", error);
        }
        setExceptions([]);
      }
    })();
    // User data comes from API - use placeholder for now
    // TODO: Load suppliers from database API
    const suppliers = dispatchRecords.map((record) => {
      return {
        sellerId: record.sellerId,
        companyName: record.sellerId, // Placeholder - TODO: Load from database
        phase: record.phase,
        status: record.status,
      };
    });
    setDispatchedSuppliers(suppliers);

    // Compute recommendations if we have bids and RFQ
    if (rfq && bids.length > 0) {
      try {
        // Convert RFQ to Request format
        const request = rfqToRequest(rfq);
        
        // Convert bids to quotes
        const quotes = mapBidsToQuotes(bids, rfq);
        
        // Get recommendations
        const rec = recommendForRequest(request, quotes);
        
        // Check if recommendation changed (top quote changed)
        const currentRecommendedSellerId = rec.recommended?.sellerId || null;
        if (
          previousRecommendedSellerId !== null &&
          currentRecommendedSellerId !== null &&
          previousRecommendedSellerId !== currentRecommendedSellerId
        ) {
          // Recommendation changed - create system message
          try {
            // Create system message in buyer's thread (use unassigned seller for buyer-only thread)
            // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
            if (user) {
              const threadId = generateThreadId(id, user.id, "__unassigned__");
              createSystemMessage(threadId, `Recommendation updated`);
            }
          } catch (error) {
            // Silently fail if message creation fails
            if (process.env.NODE_ENV === "development") {
              console.error("Error creating recommendation update message:", error);
            }
          }
        }
        
        setRecommendation(rec);
        setPreviousRecommendedSellerId(currentRecommendedSellerId);
      } catch (error) {
        // Silently fail - recommendations are optional
        if (process.env.NODE_ENV === "development") {
          console.error("Error computing recommendations:", error);
        }
        setRecommendation(null);
        setPreviousRecommendedSellerId(null);
      }
    } else {
      setRecommendation(null);
      setPreviousRecommendedSellerId(null);
    }
  };

  useEffect(() => {
    loadData();
    
      // Check if RFQ was deleted and redirect
      const checkRfqExists = async () => {
        // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
        if (!user) return;
        
        // Check if RFQ exists via API (server is source of truth)
        try {
          const res = await fetch(`/api/buyer/rfqs/${id}`, {
            credentials: "include",
          });
          if (!res.ok && res.status === 404) {
            // RFQ was deleted, redirect to dashboard
            router.replace("/buyer/dashboard");
          }
        } catch (error) {
          // Silently fail - don't block page load
        }
      };
    
    // Check after a short delay to allow for deletion
    const timeoutId = setTimeout(checkRfqExists, 100);
    return () => clearTimeout(timeoutId);
  }, [id, router]);

  // Separate effect for fallback expansion check (runs after RFQ is loaded)
  useEffect(() => {
    if (!rfq) return;

    // Check and expand fallback suppliers if conditions are met
    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (user) {
      (async () => {
        try {
          // Convert RFQ to Request format for fallback check
          const request = rfqToRequest(rfq);
          // Ensure status is "posted" (RFQ status "OPEN" maps to "posted")
          if (request.status === "posted") {
            // Call API route instead of server-only function
            const res = await fetch(`/api/rfqs/${id}/expand-fallback`, {
              method: "POST",
              credentials: "include",
            });
            const data = res.ok ? await res.json() : null;
            const expansionResult = data?.result;
            // If fallback was expanded, reload data to show new suppliers
            if (expansionResult && expansionResult.fallbackCount > 0) {
              // Small delay to ensure dispatch records are saved
              setTimeout(() => {
                loadData();
              }, 100);
            }
          }
        } catch (error) {
          // Silently fail - don't block page load
          if (process.env.NODE_ENV === "development") {
            console.error("Error checking fallback expansion:", error);
          }
        }
      })();
    }
  }, [rfq, id]);

  useEffect(() => {
    // Mark unseen bids as seen via API
    const markBidsAsSeen = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Mark all bids for this RFQ as seen via API
        const res = await fetch(`/api/buyer/rfqs/${id}/bids/mark-seen`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        
        if (res.ok) {
          const data = await res.json();
          if (process.env.NODE_ENV === "development") {
            console.log("[BIDS_MARK_SEEN_OK]", { rfqId: id, updatedCount: data.updatedCount });
          }
        } else if (res.status === 404) {
          // RFQ not found or doesn't belong to buyer - silently skip
          if (process.env.NODE_ENV === "development") {
            console.log("[BIDS_MARK_SEEN_SKIPPED]", { rfqId: id, reason: "RFQ not found" });
          }
        }
      } catch (error) {
        // Silently fail - don't block page load
        if (process.env.NODE_ENV === "development") {
          console.error("Error marking bids as seen:", error);
        }
      }
    };

    markBidsAsSeen();
    setLoading(false);
  }, [id, user]);

  const handleAwardBid = async (bidId: string, _sellerName: string) => {
    if (!rfq) return;

    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user) return;

    // VALIDATION: Find winning bid from state (loaded from API)
    const winningBid = bids.find((b) => b.id === bidId);
    
    // CRITICAL: Validate winning bid exists BEFORE mutating any state
    if (!winningBid) {
      showToast({
        type: "error",
        message: "Cannot award: Bid not found. The bid may have been deleted or does not exist.",
      });
      loadData(); // Reload to show current state
      return;
    }

    // Call canonical award endpoint (server handles RFQ update, bid status, order creation, notifications)
    try {
      const res = await fetch(`/api/buyer/rfqs/${id}/award`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningBidId: bidId }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || "Failed to award bid";
        throw new Error(errorMessage);
      }

      const result = await res.json();
      
      // Show success message
      showToast({
        type: "success",
        message: `Bid awarded successfully! Order ${result.order?.id || "created"}.`,
      });

      // Reload data to reflect changes (RFQ status, order, etc.)
      loadData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to award bid";
      showToast({
        type: "error",
        message: errorMessage,
      });
      console.error("Error awarding bid:", error);
    }

    // Order is already created by the award endpoint
    // Reload the order data from the API
    try {
      const res = await fetch(`/api/buyer/orders?rfqId=${id}`, {
        credentials: "include",
      });
      
      if (res.ok) {
        const data = await res.json();
        const orders = Array.isArray(data) ? data : (data.data || []);
        const newOrder = orders.find((o: any) => o.rfqId === id);
        if (newOrder) {
          setOrder(newOrder);
        }
      } else {
        console.warn("[handleAwardBid] Failed to reload order after award:", {
          status: res.status,
          statusText: res.statusText,
        });
      }
    } catch (error) {
      console.error("Error reloading order after award:", error);
      // Don't show error toast - order was created successfully by award endpoint
      // This is just a reload failure
    }

    // Create system message in thread
    if (winningBid.sellerId && user?.id) {
      const buyerId = user.id;
      const threadId = generateThreadId(id, buyerId, winningBid.sellerId);
      
      createSystemMessage(
        threadId,
        `Request ${rfq.rfqNumber} has been awarded to ${winningBid.sellerName}. Purchase order has been generated.`,
        {
          eventType: "AWARD_MADE",
          rfqId: id,
          rfqNumber: rfq.rfqNumber,
          bidId: bidId,
          sellerName: winningBid.sellerName,
        }
      );
    }

    // Removed pushLegacyNotification calls - notifications will be created server-side when order is awarded via API
    // TODO: When /api/buyer/rfqs/[id]/award endpoint is implemented, it will create notifications server-side

    // Reload data
    loadData();
  };

  const getAwardedBid = () => {
    if (!rfq?.awardedBidId) return null;
    return bids.find((b) => b.id === rfq.awardedBidId);
  };

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (!rfq) {
    return (
      <>
        {/* Mark notifications as read when page loads */}
        <MarkNotificationsRead rfqId={id} />
        <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
            <Link
              href="/buyer/dashboard"
              className="text-sm text-zinc-600 hover:text-black"
            >
              ← Back to Dashboard
            </Link>
            <div className="mt-8 text-center">
              <p className="text-zinc-600">
                RFQ not found.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Determine current status for display
  const currentStatus = order 
    ? order.status.charAt(0).toUpperCase() + order.status.slice(1)
    : rfq.status;
  
  const statusVariant = 
    currentStatus === "Delivered" || currentStatus === "AWARDED" ? "success" :
    currentStatus === "Scheduled" || currentStatus === "Posted" || currentStatus === "Quoting" || currentStatus === "OPEN" ? "info" :
    currentStatus === "Confirmed" || currentStatus === "Ordered" ? "success" :
    currentStatus === "Cancelled" ? "error" :
    "default";

  return (
    <div className="flex flex-1 px-6 py-8">
      <div className="w-full max-w-7xl mx-auto">
          {/* Exception Panel - Resolve/Escalate Actions */}
          {exceptions.filter((ex) => !ex.isResolved).length > 0 && (
            <div className="mb-6 p-4 border border-amber-200 rounded-lg bg-amber-50">
              <h3 className="text-lg font-semibold text-amber-900 mb-3">
                Needs Attention
              </h3>
              <div className="space-y-3">
                {exceptions
                  .filter((ex) => !ex.isResolved)
                  .map((exception) => (
                    <div key={exception.id} className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900">
                          {exception.message}
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Severity: {exception.severity}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {exception.type === "NO_SUPPLIER_RESPONSE" && (
                          <button
                            onClick={async () => {
                              if (!rfq) return;
                              // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                              if (!user) return;
                              
                              try {
                                const request = await getRequest(id, user.id) || rfqToRequest(rfq);
                                if (request && request.status === "posted") {
                                  const res = await fetch(`/api/rfqs/${id}/expand-fallback`, {
                                    method: "POST",
                                    credentials: "include",
                                  });
                                  const data = res.ok ? await res.json() : null;
                                  const result = data?.result;
                                  if (result && result.fallbackCount > 0) {
                                    showToast({
                                      type: "success",
                                      message: `Expanded to ${result.fallbackCount} fallback supplier(s)`,
                                    });
                                    // Send system message
                                    const threadId = generateThreadId(id, user?.id || "", "__unassigned__");
                                    createSystemMessage(
                                      threadId,
                                      `Request expanded to ${result.fallbackCount} additional supplier(s) due to no response from primary suppliers.`,
                                      {
                                        eventType: "FALLBACK_EXPANDED",
                                        requestId: id,
                                        fallbackCount: result.fallbackCount,
                                      }
                                    );
                                    loadData(); // Reload to refresh exceptions
                                  } else {
                                    showToast({
                                      type: "info",
                                      message: "No fallback suppliers available or already expanded",
                                    });
                                  }
                                }
                              } catch (error) {
                                showToast({
                                  type: "error",
                                  message: "Failed to expand to fallback suppliers",
                                });
                                console.error("Error expanding fallback:", error);
                              }
                            }}
                            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                          >
                            Expand to fallback suppliers
                          </button>
                        )}
                        {exception.type === "CONFIRM_OVERDUE" && order && (
                          <button
                            onClick={async () => {
                              // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                              if (!user || !order) return;
                              
                              try {
                                const threadId = generateThreadId(id, user.id, order.sellerId);
                                createSystemMessage(
                                  threadId,
                                  `Reminder: Please confirm this order. The order was awarded ${Math.round(
                                    (new Date().getTime() - new Date(order.statusHistory.find((e) => e.status === "awarded")?.at || order.createdAt).getTime()) / (1000 * 60 * 60)
                                  )} hours ago.`,
                                  {
                                    eventType: "CONFIRM_REMINDER",
                                    orderId: order.id,
                                    requestId: id,
                                  }
                                );
                                showToast({
                                  type: "success",
                                  message: "Reminder sent to supplier",
                                });
                                loadData(); // Reload to refresh exceptions
                              } catch (error) {
                                showToast({
                                  type: "error",
                                  message: "Failed to send reminder",
                                });
                                console.error("Error sending reminder:", error);
                              }
                            }}
                            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                          >
                            Remind supplier to confirm
                          </button>
                        )}
                        {(exception.type === "SCHEDULE_OVERDUE" || exception.type === "DELIVERY_OVERDUE") && order && (
                          <button
                            onClick={async () => {
                              // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                              if (!user || !order) return;
                              
                              try {
                                const threadId = generateThreadId(id, user.id, order.sellerId);
                                const statusText = exception.type === "SCHEDULE_OVERDUE" ? "schedule" : "delivery";
                                createSystemMessage(
                                  threadId,
                                  `Request for update: Please provide an update on the ${statusText} status for this order.`,
                                  {
                                    eventType: "UPDATE_REQUEST",
                                    orderId: order.id,
                                    requestId: id,
                                    statusType: statusText,
                                  }
                                );
                                showToast({
                                  type: "success",
                                  message: "Update request sent to supplier",
                                });
                                loadData(); // Reload to refresh exceptions
                              } catch (error) {
                                showToast({
                                  type: "error",
                                  message: "Failed to send update request",
                                });
                                console.error("Error sending update request:", error);
                              }
                            }}
                            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                          >
                            Request update
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              {/* Two-Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
            {/* Left Column: RFQ Details + Bids */}
            <div className="lg:col-span-2 space-y-8">
              {/* RFQ Details Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    {/* V1 FIX: Job Name / PO as primary identifier */}
                    <h2 className="text-2xl font-semibold text-black">
                      {rfq.jobNameOrPo || rfq.title || "Untitled Request"}
                    </h2>
                    <UnreadBidBadge rfqId={rfq.id} />
                  </div>
                  {rfq.jobNameOrPo && rfq.title && rfq.title !== rfq.jobNameOrPo && (
                    <p className="text-sm text-zinc-600 mb-1">
                      {rfq.title}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {rfq.rfqNumber}
                  </p>
                </CardHeader>
                <CardContent className="px-6 py-6 space-y-8">
                  {rfq.notes && (
                    <div>
                      <p className="text-sm font-medium text-zinc-600 mb-2">
                        Notes
                      </p>
                      <p className="text-black whitespace-pre-wrap">
                        {rfq.notes}
                      </p>
                    </div>
                  )}

                  {/* Required Terms */}
                  <div>
                    <h3 className="text-sm font-semibold text-black mb-4">
                      Required Terms
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-zinc-600 mb-2">
                    Category
                  </p>
                  <p className="text-black">
                    {rfq.category}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-600 mb-2">
                    Fulfillment Type
                  </p>
                  <p className="text-black">
                    {rfq.terms.fulfillmentType}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-600 mb-2">
                    {rfq.terms.fulfillmentType === "PICKUP" ? "Pickup Date" : "Requested Delivery Date"}
                  </p>
                  <p className="text-black">
                    {formatDateShort(rfq.terms.requestedDate)}
                  </p>
                </div>
                {rfq.terms.fulfillmentType === "DELIVERY" && (
                  <>
                    <div>
                      <p className="text-sm font-medium text-zinc-600 mb-2">
                        Delivery Preference
                      </p>
                      <p className="text-black">
                        {rfq.terms.deliveryPreference || "ANYTIME"}
                      </p>
                    </div>
                    {rfq.terms.deliveryInstructions && (
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-zinc-600 mb-2">
                          Special Delivery Instructions
                        </p>
                        <p className="text-black whitespace-pre-wrap">
                          {rfq.terms.deliveryInstructions}
                        </p>
                      </div>
                    )}
                    {rfq.terms.location && (
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-zinc-600 mb-2">
                          Delivery Address
                        </p>
                        <p className="text-black">
                          {rfq.terms.location}
                        </p>
                      </div>
                    )}
                  </>
                )}
                    </div>
                  </div>

                  {/* Line Items */}
                  <div>
                    <h3 className="text-sm font-semibold text-black mb-4">
                      Line Items
                    </h3>
              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-medium text-black">
                        Description
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-black">
                        Quantity
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-black">
                        Unit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {rfq.lineItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 text-black">
                          {item.description}
                        </td>
                        <td className="px-6 py-4 text-black">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-4 text-black">
                          {item.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  </div>
                  </div>
                </CardContent>
              </Card>

                {/* Routing Status Section */}
              {dispatchedSuppliers.length > 0 && (
                <Card>
                  <CardHeader>
                    <h2 className="text-xl font-semibold text-black">
                      Routing Status
                    </h2>
                  </CardHeader>
                  <CardContent>
                  {/* Primary Suppliers */}
                  {dispatchedSuppliers.filter((s) => s.phase === "primary").length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-zinc-700 mb-2">
                        Primary Suppliers
                      </h3>
                      <div className="space-y-1">
                        {dispatchedSuppliers
                          .filter((s) => s.phase === "primary")
                          .map((supplier) => (
                            <div
                              key={supplier.sellerId}
                              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-50"
                            >
                              <span className="text-sm text-black">
                                {supplier.companyName}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  supplier.status === "responded"
                                    ? "bg-green-100 text-green-700"
                                    : supplier.status === "opened"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-zinc-100 text-zinc-700"
                                }`}
                              >
                                {supplier.status === "responded"
                                  ? "Responded"
                                  : supplier.status === "opened"
                                  ? "Opened"
                                  : "Sent"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback Suppliers */}
                  {dispatchedSuppliers.filter((s) => s.phase === "fallback").length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-zinc-700 mb-2">
                        Fallback Suppliers
                      </h3>
                      <div className="space-y-1">
                        {dispatchedSuppliers
                          .filter((s) => s.phase === "fallback")
                          .map((supplier) => (
                            <div
                              key={supplier.sellerId}
                              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-50"
                            >
                              <span className="text-sm text-black">
                                {supplier.companyName}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  supplier.status === "responded"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-zinc-100 text-zinc-700"
                                }`}
                              >
                                {supplier.status === "responded" ? "Responded" : "Sent"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {dispatchedSuppliers.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-zinc-200">
                      <p className="text-xs text-zinc-600">
                        {dispatchedSuppliers.filter((s) => s.phase === "primary").length} primary,{" "}
                        {dispatchedSuppliers.filter((s) => s.phase === "fallback").length} fallback
                      </p>
                    </div>
                  )}
                  </CardContent>
                </Card>
              )}

                {/* Recommendations Section */}
              {bids.length === 0 ? (
                <Card>
                  <CardContent className="px-6 py-8 text-center">
                    <p className="text-zinc-600">
                      Awaiting quotes
                    </p>
                  </CardContent>
                </Card>
              ) : recommendation && recommendation.recommended ? (
                <div>
                  <h2 className="text-xl font-semibold text-black mb-6">
                    Recommendations
                  </h2>
                <div className="flex flex-col gap-4">
                  {/* Recommended Card */}
                  {recommendation.recommended && (
                    <div className="border-2 border-green-200 rounded-lg p-8 bg-green-50">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-green-700 uppercase tracking-wide">
                              {bids.length === 1 ? "Only Bid" : "Recommended"}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-black">
                            {bids.find((b) => b.sellerId === recommendation.recommended?.sellerId)?.sellerDisplayName || 
                             bids.find((b) => b.sellerId === recommendation.recommended?.sellerId)?.sellerName || 
                             "Supplier"}
                          </h3>
                          {/* Reliability Tags */}
                          {(() => {
                            // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                            const sellerId = recommendation.recommended?.sellerId;
                            if (!user || !sellerId) return null;
                            
                            const tags = getSupplierReliabilityTags(user.id, sellerId, rfq?.category);
                            if (tags.length === 0) return null;
                            
                            return (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {tags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      tag.type === "positive"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-amber-100 text-amber-700"
                                    }`}
                                  >
                                    {tag.label}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-black">
                            ${recommendation.recommended.totalPrice.toFixed(2)}
                          </p>
                          {recommendation.recommended.leadTimeDays !== undefined && (
                            <p className="text-sm text-zinc-600">
                              {recommendation.recommended.leadTimeDays} day{recommendation.recommended.leadTimeDays !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Award Button - Only show if no order exists or order is cancelled */}
                      {rfq.status === "OPEN" && (!order || order.status === "cancelled") && (
                        <div className="mt-4 pt-3 border-t border-green-200">
                          <button
                            onClick={() => {
                              const recommendedBid = bids.find((b) => b.sellerId === recommendation.recommended?.sellerId);
                              if (recommendedBid) {
                                setConfirmingBidId(recommendedBid.id);
                              }
                            }}
                            className="w-full px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-zinc-800 font-medium"
                          >
                            Award This Quote
                          </button>
                        </div>
                      )}
                      {order && order.status !== "cancelled" && (
                        <div className="mt-4 pt-3 border-t border-green-200">
                          <p className="text-sm text-zinc-600">
                            Already awarded
                          </p>
                        </div>
                      )}
                      {(() => {
                        const rankingInfo = recommendation.ranking.find((r) => r.quote.sellerId === recommendation.recommended?.sellerId);
                        const isExpanded = expandedBreakdown === recommendation.recommended?.sellerId;
                        return rankingInfo && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            <button
                              onClick={() => setExpandedBreakdown(isExpanded ? null : recommendation.recommended?.sellerId || null)}
                              className="text-xs font-medium text-green-700 hover:underline mb-2 flex items-center gap-1"
                            >
                              Why this recommendation? {isExpanded ? "−" : "+"}
                            </button>
                            {isExpanded && rankingInfo.breakdown && (
                              <div className="text-xs text-zinc-600 space-y-2">
                                <div>
                                  <p className="font-medium text-zinc-700 mb-1">Score breakdown:</p>
                                  <ul className="space-y-0.5 ml-2">
                                    <li>Price: {rankingInfo.breakdown.priceComponent.toFixed(3)}</li>
                                    <li>Speed: {rankingInfo.breakdown.speedComponent.toFixed(3)}</li>
                                    <li>Completeness: {rankingInfo.breakdown.completenessComponent.toFixed(3)}</li>
                                    {rankingInfo.breakdown.preferredBonus > 0 && (
                                      <li>Preferred bonus: +{rankingInfo.breakdown.preferredBonus.toFixed(3)}</li>
                                    )}
                                    {rankingInfo.breakdown.reliabilityBonus > 0 && (
                                      <li>Reliability: {rankingInfo.breakdown.reliabilityBonus.toFixed(3)}</li>
                                    )}
                                    <li className="font-medium pt-1 border-t border-zinc-200 mt-1">
                                      Total: {rankingInfo.breakdown.totalScore.toFixed(3)}
                                    </li>
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-medium text-zinc-700 mb-1">Values used:</p>
                                  <ul className="space-y-0.5 ml-2">
                                    <li>Price: ${rankingInfo.breakdown.priceUsed?.toFixed(2) ?? "N/A"}</li>
                                    <li>Lead time: {rankingInfo.breakdown.leadTimeUsed ? `${rankingInfo.breakdown.leadTimeUsed} day${rankingInfo.breakdown.leadTimeUsed !== 1 ? "s" : ""}` : "N/A"}</li>
                                  </ul>
                                </div>
                              </div>
                            )}
                            {!isExpanded && rankingInfo.reasons.length > 0 && (
                              <ul className="text-sm text-zinc-600 space-y-0.5">
                                {rankingInfo.reasons.map((reason, idx) => (
                                  <li key={idx}>• {reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Backup Card */}
                  {recommendation.backup && (
                    <div className="border border-blue-200 rounded-lg p-6 bg-blue-50">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-blue-700 uppercase tracking-wide">
                              Backup Option
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-black">
                            {bids.find((b) => b.sellerId === recommendation.backup?.sellerId)?.sellerDisplayName || 
                             bids.find((b) => b.sellerId === recommendation.backup?.sellerId)?.sellerName || 
                             "Supplier"}
                          </h3>
                          {/* Reliability Tags */}
                          {(() => {
                            // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                            const sellerId = recommendation.backup?.sellerId;
                            if (!user || !sellerId) return null;
                            
                            const tags = getSupplierReliabilityTags(user.id, sellerId, rfq?.category);
                            if (tags.length === 0) return null;
                            
                            return (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {tags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      tag.type === "positive"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-amber-100 text-amber-700"
                                    }`}
                                  >
                                    {tag.label}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-black">
                            ${(recommendation.backup.totalPrice ?? 0).toFixed(2)}
                          </p>
                          {recommendation.backup.leadTimeDays !== undefined && (
                            <p className="text-sm text-zinc-600">
                              {recommendation.backup.leadTimeDays} day{recommendation.backup.leadTimeDays !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      {(() => {
                        const rankingInfo = recommendation.ranking.find((r) => r.quote.sellerId === recommendation.backup?.sellerId);
                        const isExpanded = expandedBreakdown === recommendation.backup?.sellerId;
                        return rankingInfo && (
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <button
                              onClick={() => setExpandedBreakdown(isExpanded ? null : recommendation.backup?.sellerId || null)}
                              className="text-xs font-medium text-blue-700 hover:underline mb-2 flex items-center gap-1"
                            >
                              Why this recommendation? {isExpanded ? "−" : "+"}
                            </button>
                            {isExpanded && rankingInfo.breakdown && (
                              <div className="text-xs text-zinc-600 space-y-2">
                                <div>
                                  <p className="font-medium text-zinc-700 mb-1">Score breakdown:</p>
                                  <ul className="space-y-0.5 ml-2">
                                    <li>Price: {rankingInfo.breakdown.priceComponent.toFixed(3)}</li>
                                    <li>Speed: {rankingInfo.breakdown.speedComponent.toFixed(3)}</li>
                                    <li>Completeness: {rankingInfo.breakdown.completenessComponent.toFixed(3)}</li>
                                    {rankingInfo.breakdown.preferredBonus > 0 && (
                                      <li>Preferred bonus: +{rankingInfo.breakdown.preferredBonus.toFixed(3)}</li>
                                    )}
                                    {rankingInfo.breakdown.reliabilityBonus > 0 && (
                                      <li>Reliability: {rankingInfo.breakdown.reliabilityBonus.toFixed(3)}</li>
                                    )}
                                    <li className="font-medium pt-1 border-t border-zinc-200 mt-1">
                                      Total: {rankingInfo.breakdown.totalScore.toFixed(3)}
                                    </li>
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-medium text-zinc-700 mb-1">Values used:</p>
                                  <ul className="space-y-0.5 ml-2">
                                    <li>Price: ${rankingInfo.breakdown.priceUsed?.toFixed(2) ?? "N/A"}</li>
                                    <li>Lead time: {rankingInfo.breakdown.leadTimeUsed ? `${rankingInfo.breakdown.leadTimeUsed} day${rankingInfo.breakdown.leadTimeUsed !== 1 ? "s" : ""}` : "N/A"}</li>
                                  </ul>
                                </div>
                              </div>
                            )}
                            {!isExpanded && rankingInfo.reasons.length > 0 && (
                              <ul className="text-sm text-zinc-600 space-y-0.5">
                                {rankingInfo.reasons.map((reason, idx) => (
                                  <li key={idx}>• {reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

              {/* Bids Section */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-black">
                    All Bids ({bids.length})
                  </h2>
                </div>
                {bids.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-zinc-600">
                        No bids yet.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                <div className="flex flex-col gap-6">
                  {bids.map((bid) => {
                    const bidStatus = bid.status || "SUBMITTED";
                    const isWon = bidStatus === "WON";
                    const isLost = bidStatus === "LOST";
                    const isUnseen =
                      bid.seenByBuyerAt === null || bid.seenByBuyerAt === undefined;
                    
                    // Find ranking info for this bid
                    const rankingInfo = recommendation?.ranking.find(
                      (r) => r.quote.sellerId === bid.sellerId
                    );
                    const isRecommended = recommendation?.recommended?.sellerId === bid.sellerId;
                    const isBackup = recommendation?.backup?.sellerId === bid.sellerId;
                    
                    return (
                      <Card
                        key={bid.id}
                        className={
                          isRecommended
                            ? "border-green-300 bg-green-50"
                            : isBackup
                            ? "border-blue-300 bg-blue-50"
                            : isUnseen
                            ? "border-blue-300 bg-blue-50"
                            : isWon
                            ? "border-green-200 bg-green-50"
                            : isLost
                            ? "opacity-60"
                            : ""
                        }
                      >
                        <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-semibold text-black">
                                {bid.sellerDisplayName || bid.sellerName}
                              </h3>
                              {isRecommended && (
                                <span className="text-xs px-2 py-1 rounded bg-green-500 text-white font-medium">
                                  {bids.length === 1 ? "Only Bid" : "Recommended"}
                                </span>
                              )}
                              {isBackup && (
                                <span className="text-xs px-2 py-1 rounded bg-blue-500 text-white font-medium">
                                  Backup
                                </span>
                              )}
                              {isUnseen && !isRecommended && !isBackup && (
                                <span className="text-xs px-2 py-1 rounded bg-blue-500 text-white font-medium">
                                  New
                                </span>
                              )}
                              {bidStatus !== "SUBMITTED" && (
                                <span
                                  className={`text-xs px-2 py-1 rounded ${
                                    isWon
                                      ? "bg-green-200 text-green-800"
                                      : "bg-zinc-200 text-zinc-700"
                                  }`}
                                >
                                  {bidStatus}
                                </span>
                              )}
                              {/* Score only shown in dev mode with debug param */}
                              {(() => {
                                if (process.env.NODE_ENV !== "development") return null;
                                // Check for debug param using window.location (client-side only)
                                if (typeof window !== "undefined") {
                                  const urlParams = new URLSearchParams(window.location.search);
                                  if (urlParams.get("debug") !== "1") return null;
                                } else {
                                  return null;
                                }
                                return rankingInfo ? (
                                  <span className="text-xs px-2 py-1 rounded bg-zinc-100 text-zinc-700">
                                    Score: {rankingInfo.score.toFixed(2)}
                                  </span>
                                ) : null;
                              })()}
                              {/* Reliability Tags */}
                              {(() => {
                                // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                                if (!user || !bid.sellerId) return null;
                                
                                const tags = getSupplierReliabilityTags(user.id, bid.sellerId, rfq?.category);
                                if (tags.length === 0) return null;
                                
                                return (
                                  <>
                                    {tags.map((tag, idx) => (
                                      <span
                                        key={idx}
                                        className={`text-xs px-2 py-1 rounded ${
                                          tag.type === "positive"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-amber-100 text-amber-700"
                                        }`}
                                      >
                                        {tag.label}
                                      </span>
                                    ))}
                                  </>
                                );
                              })()}
                            </div>
                            <p className="text-sm text-zinc-600">
                              Submitted {formatDateShort(bid.createdAt)}
                            </p>
                            {rankingInfo && rankingInfo.reasons.length > 0 && (
                              <div className="mt-2">
                                <ul className="text-xs text-zinc-600 space-y-0.5">
                                  {rankingInfo.reasons.map((reason, idx) => (
                                    <li key={idx}>• {reason}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-sm text-zinc-600">
                              {bid.lineItems.length} line item(s)
                            </p>
                            {rfq.status === "OPEN" && (!order || order.status === "cancelled") && (
                              <div className="flex flex-col items-end gap-2">
                                {confirmingBidId === bid.id ? (
                                  <>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={async () => {
                                          setConfirmingBidId(null);
                                          await handleAwardBid(bid.id, bid.sellerName);
                                        }}
                                        className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-zinc-800 font-medium"
                                      >
                                        Confirm Award
                                      </button>
                                      <button
                                        onClick={() => setConfirmingBidId(null)}
                                        className="px-4 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-100 text-black font-medium"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                    <p className="text-xs text-amber-600">
                                      Awarding will close this request and notify the seller.
                                    </p>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => {
                                      // Clear any other confirming bid
                                      setConfirmingBidId(bid.id);
                                    }}
                                    className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-zinc-800 font-medium"
                                  >
                                    Award
                                  </button>
                                )}
                              </div>
                            )}
                            {order && order.status !== "cancelled" && (
                              <div className="flex flex-col items-end gap-2">
                                <p className="text-sm text-zinc-600">
                                  Already awarded
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                      {/* Bid Line Items Table */}
                      <div className="border border-zinc-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-zinc-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium text-black">
                                Description
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-black">
                                Quantity
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-medium text-black">
                                Unit Price
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200">
                            {bid.lineItems.map((item, index) => (
                              <tr key={index}>
                                <td className="px-4 py-2 text-black">
                                  {item.description}
                                </td>
                                <td className="px-4 py-2 text-black">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="px-4 py-2 text-black">
                                  ${parseFloat(item.unitPrice || "0").toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Bid Totals */}
                      <div className="mt-4 pt-4 border-t border-zinc-200">
                        <div className="flex justify-end">
                          <div className="text-right space-y-1">
                            {bid.deliveryCharge !== undefined && bid.deliveryCharge > 0 && (
                              <div className="flex justify-between gap-8 text-sm text-zinc-600">
                                <span>Line Items Total:</span>
                                <span>
                                  $
                                  {bid.lineItems
                                    .reduce((sum, item) => {
                                      const qty = parseFloat(item.quantity) || 0;
                                      const price = parseFloat(item.unitPrice) || 0;
                                      return sum + qty * price;
                                    }, 0)
                                    .toFixed(2)}
                                </span>
                              </div>
                            )}
                            {bid.deliveryCharge !== undefined && bid.deliveryCharge > 0 && (
                              <div className="flex justify-between gap-8 text-sm text-zinc-600">
                                <span>Delivery Charge:</span>
                                <span>${bid.deliveryCharge.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-8 font-semibold text-black pt-2 border-t border-zinc-200">
                              <span>Total:</span>
                              <span>
                                ${bid.total !== undefined ? bid.total.toFixed(2) : bid.lineItems.reduce((sum, item) => {
                                  const qty = parseFloat(item.quantity) || 0;
                                  const price = parseFloat(item.unitPrice) || 0;
                                  return sum + qty * price;
                                }, 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {bid.notes && (
                        <div className="mt-4">
                          <p className="text-sm text-zinc-600 mb-1">
                            Notes:
                          </p>
                          <p className="text-black whitespace-pre-wrap">
                            {bid.notes}
                          </p>
                        </div>
                      )}

                      {/* View Messages link - per seller */}
                      {bid.sellerId && (
                        <div className="mt-4 pt-4 border-t border-zinc-200">
                          <Link
                            href={`/buyer/messages/${id}?sellerId=${bid.sellerId}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            View Messages with {bid.sellerName}
                          </Link>
                        </div>
                      )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              </div>
            </div>

            {/* Right Column: Sticky Status & Actions Card */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <Card>
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-black">
                      Status & Actions
                    </h3>
                  </CardHeader>
                  <CardContent className="px-6 py-6 space-y-6">
                    {/* Current Status */}
                    <div>
                      <p className="text-sm font-medium text-zinc-600 mb-3">
                        Current Status
                      </p>
                      <Badge variant={statusVariant} className="text-base px-3 py-1">
                        {currentStatus}
                      </Badge>
                      {rfq.status === "AWARDED" && getAwardedBid() && (
                        <p className="text-sm text-zinc-600 mt-3">
                          Awarded to {getAwardedBid()?.sellerName}
                          {rfq.awardedAt && (
                            <span className="block text-xs mt-1">
                              {formatDateShort(rfq.awardedAt)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Fulfillment Info */}
                    <div className="pt-6 border-t border-zinc-200">
                      <p className="text-sm font-medium text-zinc-600 mb-2">
                        Fulfillment Type
                      </p>
                      <p className="text-black font-medium mb-3">
                        {rfq.terms.fulfillmentType}
                      </p>
                      <p className="text-sm font-medium text-zinc-600 mb-2">
                        {rfq.terms.fulfillmentType === "PICKUP" ? "Pickup Date" : "Requested Delivery Date"}
                      </p>
                      <p className="text-black">
                        {formatDateShort(rfq.terms.requestedDate)}
                      </p>
                      {rfq.terms.fulfillmentType === "DELIVERY" && rfq.terms.location && (
                        <div className="mt-4">
                          <p className="text-sm font-medium text-zinc-600 mb-2">
                            Delivery Address
                          </p>
                          <p className="text-sm text-black">
                            {rfq.terms.location}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Key Actions */}
                    <div className="pt-6 border-t border-zinc-200 space-y-3">
                      {/* Award Action - Show if OPEN and has bids */}
                      {rfq.status === "OPEN" && (!order || order.status === "cancelled") && recommendation?.recommended && (
                        <Button
                          variant="primary"
                          size="md"
                          className="w-full"
                          onClick={() => {
                            const recommendedBid = bids.find((b) => b.sellerId === recommendation.recommended?.sellerId);
                            if (recommendedBid) {
                              setConfirmingBidId(recommendedBid.id);
                            }
                          }}
                        >
                          Award Recommended Quote
                        </Button>
                      )}

                      {/* PO Actions - Show if AWARDED or CLOSED */}
                      {(rfq.status === "AWARDED" || rfq.status === "CLOSED") && (
                        <PurchaseOrderActions rfqId={id} role="BUYER" />
                      )}

                      {/* Exception Actions */}
                      {exceptions.filter((ex) => !ex.isResolved).length > 0 && (
                        <div className="space-y-2">
                          {exceptions
                            .filter((ex) => !ex.isResolved)
                            .map((exception) => (
                              <div key={exception.id}>
                                {exception.type === "NO_SUPPLIER_RESPONSE" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={async () => {
                                      if (!rfq) return;
                                      // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                                      if (!user) return;
                                      
                                      try {
                                        const request = await getRequest(id, user.id) || rfqToRequest(rfq);
                                        if (request && request.status === "posted") {
                                          // Call API route instead of server-only function
                                         const expandResponse = await fetch(`/api/rfqs/${id}/expand-fallback`, {
                                           method: "POST",
                                           headers: { "Content-Type": "application/json" },
                                           credentials: "include",
                                         });
                                         const result = expandResponse.ok ? await expandResponse.json() : null;
                                          if (result && result.fallbackCount > 0) {
                                            showToast({
                                              type: "success",
                                              message: `Expanded to ${result.fallbackCount} fallback supplier(s)`,
                                            });
                                            const threadId = generateThreadId(id, user?.id || "", "__unassigned__");
                                            createSystemMessage(
                                              threadId,
                                              `Request expanded to ${result.fallbackCount} additional supplier(s) due to no response from primary suppliers.`,
                                              {
                                                eventType: "FALLBACK_EXPANDED",
                                                requestId: id,
                                                fallbackCount: result.fallbackCount,
                                              }
                                            );
                                            loadData();
                                          } else {
                                            showToast({
                                              type: "info",
                                              message: "No fallback suppliers available or already expanded",
                                            });
                                          }
                                        }
                                      } catch (error) {
                                        showToast({
                                          type: "error",
                                          message: "Failed to expand to fallback suppliers",
                                        });
                                        console.error("Error expanding fallback:", error);
                                      }
                                    }}
                                  >
                                    Expand to Fallback Suppliers
                                  </Button>
                                )}
                                {exception.type === "CONFIRM_OVERDUE" && order && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={async () => {
                                      // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                                      if (!user || !order) return;
                                      
                                      try {
                                        const threadId = generateThreadId(id, user.id, order.sellerId);
                                        createSystemMessage(
                                          threadId,
                                          `Reminder: Please confirm this order. The order was awarded ${Math.round(
                                            (new Date().getTime() - new Date(order.statusHistory.find((e) => e.status === "awarded")?.at || order.createdAt).getTime()) / (1000 * 60 * 60)
                                          )} hours ago.`,
                                          {
                                            eventType: "CONFIRM_REMINDER",
                                            orderId: order.id,
                                            requestId: id,
                                          }
                                        );
                                        showToast({
                                          type: "success",
                                          message: "Reminder sent to supplier",
                                        });
                                        loadData();
                                      } catch (error) {
                                        showToast({
                                          type: "error",
                                          message: "Failed to send reminder",
                                        });
                                        console.error("Error sending reminder:", error);
                                      }
                                    }}
                                  >
                                    Remind Supplier to Confirm
                                  </Button>
                                )}
                                {(exception.type === "SCHEDULE_OVERDUE" || exception.type === "DELIVERY_OVERDUE") && order && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={async () => {
                                      // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                                      if (!user || !order) return;
                                      
                                      try {
                                        const threadId = generateThreadId(id, user.id, order.sellerId);
                                        const statusText = exception.type === "SCHEDULE_OVERDUE" ? "schedule" : "delivery";
                                        createSystemMessage(
                                          threadId,
                                          `Request for update: Please provide an update on the ${statusText} status for this order.`,
                                          {
                                            eventType: "UPDATE_REQUEST",
                                            orderId: order.id,
                                            requestId: id,
                                            statusType: statusText,
                                          }
                                        );
                                        showToast({
                                          type: "success",
                                          message: "Update request sent to supplier",
                                        });
                                        loadData();
                                      } catch (error) {
                                        showToast({
                                          type: "error",
                                          message: "Failed to send update request",
                                        });
                                        console.error("Error sending update request:", error);
                                      }
                                    }}
                                  >
                                    Request Update
                                  </Button>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
            </TabsContent>

            {/* Messages Tab */}
            <TabsContent value="messages">
              <div className="mt-6">
                <Card>
                  <CardContent className="p-6">
                    {conversations.length > 0 ? (
                      <div className="space-y-2">
                        {conversations.map((conversation) => {
                          // Build link to canonical Talk to Suppliers thread with RFQ context
                          const talkLink = `/buyer/suppliers/talk/${conversation.supplierId}${rfq?.id ? `?rfqId=${rfq.id}` : ""}`;
                          return (
                            <Link
                              key={conversation.id}
                              href={talkLink}
                              className="block p-4 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-black">{conversation.supplierName}</p>
                                  <p className="text-sm text-zinc-600">
                                    {conversation.lastMessagePreview || "View conversation"}
                                  </p>
                                </div>
                                <span className="text-sm text-zinc-500">→</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-sm text-zinc-500">
                          No supplier conversations yet for this RFQ.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity">
              <div className="mt-6">
                {/* Section Header */}
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-black mb-1">Activity</h2>
                  <p className="text-sm text-zinc-600">
                    A timeline of request, bid, and order updates.
                  </p>
                </div>

                {/* Timeline */}
                {getActivityEvents().length > 0 ? (
                  <div className="relative pl-8">
                    {/* Vertical Timeline Line */}
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-zinc-200" />

                    {/* Events */}
                    <div className="space-y-6">
                      {getActivityEvents().map((event) => (
                        <div key={event.id} className="relative">
                          {/* Circular Marker */}
                          <div className="absolute left-[-26px] top-1 w-2 h-2 rounded-full bg-zinc-400 border-2 border-white" />

                          {/* Event Content */}
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-black">{event.label}</p>
                                {event.badge && (
                                  <Badge
                                    variant={
                                      event.badge === "Awarded" || event.badge === "Delivered"
                                        ? "success"
                                        : event.badge === "Confirmed" || event.badge === "Scheduled"
                                        ? "info"
                                        : event.badge === "Cancelled"
                                        ? "error"
                                        : "default"
                                    }
                                    className="text-[11px] px-1.5 py-0.5"
                                  >
                                    {event.badge}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500 mt-1.5">
                                {new Date(event.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-zinc-50 border border-zinc-200 py-12 px-6">
                    <p className="text-sm text-zinc-500 text-center">
                      No activity events yet.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents">
              <div className="mt-6">
                {(rfq.status === "AWARDED" || rfq.status === "CLOSED") && rfq.awardedBidId ? (
                  <PurchaseOrderActions rfqId={id} role="BUYER" rfq={rfq} />
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-center py-12">
                        <p className="text-zinc-600">
                          Purchase order will be available after the request is awarded.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
  );
}

