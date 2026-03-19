"use client";

// NOTE: This is a client component, so it doesn't block server-side rendering.
// All data loading happens in useEffect (client-side only).
// If you add any server-side fetch calls in the future, use fetchWithTimeout from @/lib/timeout

import { Suspense } from "react";
import Link from "next/link";
import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed unused imports: generateThreadId, getUnreadCountForThread, getOrderByRequestId, getRequest, getDispatchRecords, detectAllExceptions
// These were part of the old client-side storage system
// Removed rfqToRequest import - unused
import { smartSortRfqs, normalizeRfq, isClosingSoon, getSortPriority } from "@/lib/rfqSort";
import { type RFQ } from "@/lib/rfqs";
// Removed useNotifications import - unused
import UnreadBidBadge from "@/components/UnreadBidBadge";
import { useToast, ToastContainer } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";
import Tabs, { TabsList, TabsTrigger } from "@/components/ui2/Tabs";

// Use canonical RFQ type from @/lib/rfqs

// Removed Bid interface - unused, will be defined when bids API is implemented

type TabType = "OPEN" | "AWARDED" | "CLOSED";

function BuyerRFQsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth(); // NEW FOUNDATION: Server is source of truth
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  // Removed bids state - unused, will be loaded from API when needed
  const [activeTab, setActiveTab] = useState<TabType>("OPEN");
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [deleteConfirmRfqId, setDeleteConfirmRfqId] = useState<string | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast, toasts, removeToast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);

  const loadData = async () => {
    // NEW FOUNDATION: AuthGuard handles auth/role checks
    // This function only loads data when user is authenticated
    if (!user || user.role !== "BUYER") {
      setIsInitialLoading(false);
      return;
    }

    try {

      // User is available in scope for helper functions

      // DATABASE-FIRST: Load RFQs from API (server queries database)
      // No more localStorage - server is single source of truth
      try {
        const res = await fetch(`/api/buyer/rfqs`, {
          cache: "no-store",
          credentials: "include", // CRITICAL: Include cookie for auth
        });

        if (!res.ok) {
          // Parse error response for better diagnostics
          const contentType = res.headers.get("content-type");
          let errorMessage = `Failed to load RFQs (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;
          let errorData: any = null;
          
          // Clone response to allow multiple read attempts
          const responseClone = res.clone();
          
          if (contentType?.includes("application/json")) {
            try {
              errorData = await responseClone.json();
              errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (parseError) {
              // Failed to parse JSON - try to get text response from original
              try {
                const textResponse = await res.text();
                errorMessage = textResponse.trim() || errorMessage;
              } catch (textError) {
                // Can't read response at all - use default message with status
                errorMessage = `Failed to load RFQs (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;
              }
            }
          } else {
            // Non-JSON response - try to read as text
            try {
              const textResponse = await res.text();
              errorMessage = textResponse.trim() || errorMessage;
            } catch (textError) {
              // Can't read response - use default message with status
              errorMessage = `Failed to load RFQs (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;
            }
          }
          
          // Log error with full context (only include errorData if it has meaningful content)
          const logData: any = {
            status: res.status,
            statusText: res.statusText || null,
            contentType: contentType || null,
            finalErrorMessage: errorMessage,
          };
          
          if (errorData && typeof errorData === "object" && Object.keys(errorData).length > 0) {
            logData.error = errorData.error || null;
            logData.message = errorData.message || null;
            logData.details = errorData.details || null;
            logData.fullErrorData = errorData;
          }
          
          console.error("[RFQ_LIST_FAILED]", logData);
          
          showToast({
            type: "error",
            message: errorMessage,
          });
          setRfqs([]);
          // Removed setBids - bids state was removed
        } else {
          const responseData = await res.json();
          // Handle both array and { ok: true, data: [...] } formats
          const apiRfqs = Array.isArray(responseData) ? responseData : (responseData.data || []);
          
          // Normalize for display
          const normalized = apiRfqs.map(normalizeRfq);
          setRfqs(normalized);
          
          // TODO: Load bids from database API when available
          // For now, gracefully handle empty bids
          // Removed setBids - bids state was removed
        }
      } catch (error) {
        console.error("Error loading RFQs from API:", error);
        setRfqs([]);
        // Removed setBids - bids state was removed
      }

      setIsInitialLoading(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setIsInitialLoading(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    }
  };

  // Removed getUnseenBidCount and getTotalBidCount - unused functions
  // TODO: Implement unread bid counts via database API when available

  // Removed getUnreadMessageCount - unused function
  // TODO: Implement unread message count via database API when messages are implemented

  // Load notifications from API and poll every 15 seconds
  useEffect(() => {
    if (!user?.id || user.role !== "BUYER") {
      setNotifications([]);
      return;
    }

    const loadNotifications = async () => {
      try {
        const res = await fetch("/api/buyer/notifications", {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const result = await res.json();
        
        // Handle both { ok: true, data: [...] } and direct array response
        let notifs: any[] = [];
        if (result && typeof result === "object") {
          if (result.ok && Array.isArray(result.data)) {
            notifs = result.data;
          } else if (Array.isArray(result)) {
            notifs = result;
          }
        }

        setNotifications(notifs);
      } catch (error) {
        console.error("Error loading notifications:", error);
      }
    };

    // Load on mount
    loadNotifications();

    // Poll every 15 seconds
    const intervalId = setInterval(loadNotifications, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [user]);

  // NEW FOUNDATION: AuthGuard handles auth/role checks
  // This effect only loads data when user is authenticated and role matches
  useEffect(() => {
    // Don't load data while auth is still loading
    if (status === "loading") {
      return;
    }

    // AuthGuard will redirect if not authenticated or wrong role
    if (!user || user.role !== "BUYER") {
      setIsInitialLoading(false);
      return;
    }

    // Set up 3-second watchdog for loading state
    loadingTimeoutRef.current = setTimeout(() => {
      setIsInitialLoading(false);
      setShowErrorBanner(true);
    }, 3000);

    loadData();

    // Check for success param
    if (searchParams.get("success") === "request_submitted") {
      setShowSuccessBanner(true);
      // Remove param from URL
      router.replace("/buyer/rfqs", { scroll: false });
      // Hide banner after 5 seconds
      setTimeout(() => setShowSuccessBanner(false), 5000);
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [user, status, searchParams, router]);

  // Build notification metadata map (unreadBidCount and latestNotifAt per rfqId)
  const notifMetaByRfqId = useMemo(() => {
    const meta: Record<string, { unreadBidCount: number; latestNotifAt: Date | null }> = {};

    notifications.forEach((n: any) => {
      const rfqId = n.rfqId || (n.data && n.data.rfqId);
      if (!rfqId) return;

      if (!meta[rfqId]) {
        meta[rfqId] = { unreadBidCount: 0, latestNotifAt: null };
      }

      // Track latest notification date (all types, not just BID_RECEIVED)
      if (n.createdAt) {
        try {
          const notifDate = new Date(n.createdAt);
          if (!meta[rfqId].latestNotifAt || notifDate > meta[rfqId].latestNotifAt) {
            meta[rfqId].latestNotifAt = notifDate;
          }
        } catch {
          // Invalid date, skip
        }
      }

      // Count unread BID_RECEIVED notifications
      if (n.type === "BID_RECEIVED" && (n.readAt === null || n.readAt === undefined || n.readAt === "")) {
        meta[rfqId].unreadBidCount++;
      }
    });

    return meta;
  }, [notifications]);

  // Filter by active tab, then apply notification-prioritized sort
  // CRITICAL: RFQs with unread activity MUST come first, before any other sorting
  const filteredRFQs = useMemo(() => {
    const tabFiltered = rfqs.filter((rfq) => rfq.status === activeTab);
    const now = new Date();

    // Sort with notification priority FIRST, then fall back to smartSortRfqs logic
    return [...tabFiltered].sort((a, b) => {
      const metaA = notifMetaByRfqId[a.id] || { unreadBidCount: 0, latestNotifAt: null };
      const metaB = notifMetaByRfqId[b.id] || { unreadBidCount: 0, latestNotifAt: null };

      // PRIORITY 1: RFQs with unread bids ALWAYS come first
      const hasUnreadA = metaA.unreadBidCount > 0;
      const hasUnreadB = metaB.unreadBidCount > 0;

      if (hasUnreadA && !hasUnreadB) {
        return -1; // A has unread bids, B doesn't - A comes first
      }
      if (!hasUnreadA && hasUnreadB) {
        return 1; // B has unread bids, A doesn't - B comes first
      }
      // If both have unread bids, sort by count (descending)
      if (hasUnreadA && hasUnreadB) {
        if (metaA.unreadBidCount !== metaB.unreadBidCount) {
          return metaB.unreadBidCount - metaA.unreadBidCount; // More unread bids first
        }
      }

      // PRIORITY 2: If neither has unread bids, fall back to smartSortRfqs logic
      // This preserves existing behavior (closing soon, then recency)
      const normalizedA = normalizeRfq(a);
      const normalizedB = normalizeRfq(b);
      
      const priorityA = getSortPriority(normalizedA, now);
      const priorityB = getSortPriority(normalizedB, now);
      
      // Sort by priority group
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Within same priority group, sort by dates
      if (priorityA === 1) {
        // Closing soon: sort by dueAt ASC, then createdAt DESC
        if (normalizedA.dueAt && normalizedB.dueAt) {
          const dueA = new Date(normalizedA.dueAt).getTime();
          const dueB = new Date(normalizedB.dueAt).getTime();
          if (dueA !== dueB) {
            return dueA - dueB;
          }
        }
      }
      
      // For all groups, secondary sort by createdAt DESC (newest first)
      const createdA = new Date(normalizedA.createdAt).getTime();
      const createdB = new Date(normalizedB.createdAt).getTime();
      return createdB - createdA; // Newest first
    });
  }, [rfqs, activeTab, notifMetaByRfqId]);

  const handleDeleteClick = (e: React.MouseEvent, rfqId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirmRfqId(rfqId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmRfqId) return;
    
    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user) {
      showToast({ type: "error", message: "Authentication required" });
      setDeleteConfirmRfqId(null);
      return;
    }

    const rfq = rfqs.find((r) => r.id === deleteConfirmRfqId);
    if (!rfq) {
      setDeleteConfirmRfqId(null);
      return;
    }

    // Check if user owns this RFQ (or dev mode)
    const isDevMode = process.env.NODE_ENV !== "production" && 
      false; // Removed dev flag - delete functionality should be gated by proper permissions
    
    if (!isDevMode && rfq.buyerId !== user.id) {
      showToast({ type: "error", message: "You can only delete your own requests." });
      setDeleteConfirmRfqId(null);
      return;
    }

    try {
      // DATABASE-FIRST: Delete via API (server handles database deletion)
      const res = await fetch(`/api/buyer/rfqs/${deleteConfirmRfqId}`, {
        method: "DELETE",
        credentials: "include", // CRITICAL: Include cookie for auth
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("RFQ_DELETE_FAILED", res.status, errorData);
        showToast({ type: "error", message: "Failed to delete request" });
        setDeleteConfirmRfqId(null);
        return;
      }

      // Refresh RFQs list from API
      const listRes = await fetch(`/api/buyer/rfqs`, {
        cache: "no-store",
        credentials: "include",
      });

      if (listRes.ok) {
        const responseData = await listRes.json();
        const apiRfqs = Array.isArray(responseData) ? responseData : (responseData.data || []);
        const normalized = apiRfqs.map(normalizeRfq);
        setRfqs(normalized);
      }
      
      showToast({ type: "success", message: "Request deleted" });
      setDeleteConfirmRfqId(null);
    } catch (error) {
      console.error("Error deleting RFQ:", error);
      showToast({ type: "error", message: "Failed to delete request" });
      setDeleteConfirmRfqId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmRfqId(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      {/* Non-blocking error banner (does not intercept clicks) */}
      {showErrorBanner && (
        <div className="px-6 py-2 bg-amber-50 border-b border-amber-200">
          <p className="text-sm text-amber-800 text-center">
            Some background requests failed. App should still work.
          </p>
        </div>
      )}

      {/* Non-blocking loading indicator (does not intercept clicks) */}
      {isInitialLoading && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-200">
          <p className="text-sm text-blue-800 text-center">
            Loading...
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h1 className="text-3xl font-semibold text-black mb-2">
                  Material Requests
                </h1>
                <p className="text-sm text-zinc-600">
                  Manage your material requests and track supplier responses
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/buyer/rfqs/new" prefetch={false}>
                  <Button variant="primary" size="md">
                    New Request
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Success Banner */}
          {showSuccessBanner && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardContent className="p-4">
                <p className="text-green-800 font-medium">
                  Request submitted successfully!
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)}>
            <TabsList className="mb-6">
              <TabsTrigger value="OPEN">
                Open ({rfqs.filter((r) => r.status === "OPEN").length})
              </TabsTrigger>
              <TabsTrigger value="AWARDED">
                Awarded ({rfqs.filter((r) => r.status === "AWARDED").length})
              </TabsTrigger>
              <TabsTrigger value="CLOSED">
                Closed ({rfqs.filter((r) => r.status === "CLOSED").length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* RFQ List */}
          {filteredRFQs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-600">
                No {activeTab.toLowerCase()} RFQs found.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredRFQs.map((rfq) => {
                // Debug: catch missing ids immediately
                const rfqId = rfq?.id;
                if (!rfqId) {
                  console.error("🔴 RFQ missing id", rfq);
                  return null;
                }
                
                // Note: getUnseenBidCount and getTotalBidCount are not used in render
                // TODO: Implement unread bid/message counts via database API when available
                const unreadMessages = 0;
                
                // Removed request/order variables - these were part of old client-side storage
                // TODO: Load request/order data from database API when available
                
                // Removed legacy request/order lookups - these were part of old client-side storage
                // TODO: Load request/order data from database API when available
                
                // Determine display status
                // Removed order/request status logic - these were part of old client-side storage
                // TODO: Load order/request status from database API when available
                const displayStatus = rfq.status;
                
                // Map status to Badge variant
                // Open = blue (info), Awarded = green (success), Closed = gray (default)
                const statusVariant = 
                  displayStatus === "AWARDED" ? "success" :
                  displayStatus === "OPEN" ? "info" :
                  displayStatus === "CLOSED" ? "default" :
                  "default";

                return (
                  <Card key={rfqId} className="group hover:bg-zinc-50 transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <Link 
                          href={`/buyer/rfqs/${rfqId}`}
                          prefetch={false}
                          onClick={() => {
                            // Ensure navigation works - don't prevent default
                            if (process.env.NODE_ENV === "development") {
                              console.log("🔍 BUYER_VIEW_DETAILS_CLICK", {
                                rfqId: rfqId,
                                rfqNumber: rfq.rfqNumber,
                                path: `/buyer/rfqs/${rfqId}`,
                                href: `/buyer/rfqs/${rfqId}`,
                              });
                            }
                          }}
                          className="flex-1 min-w-0"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-black">
                              {rfq.rfqNumber}
                            </span>
                            <UnreadBidBadge rfqId={rfqId} />
                            {/* Removed hasActiveExceptions badge - will be implemented via database API */}
                            {unreadMessages > 0 && (
                              <Badge variant="info">
                                {unreadMessages} unread
                              </Badge>
                            )}
                            {rfq.terms?.requestedDate && isClosingSoon(rfq.terms.requestedDate, new Date()) && (
                              <Badge variant="warning">
                                Closing soon
                              </Badge>
                            )}
                          </div>
                          {/* V1 FIX: Job Name / PO as primary, RFQ ID as secondary */}
                          <h3 className="font-medium text-black mb-1">
                            {rfq.jobNameOrPo || rfq.title || "Untitled Request"}
                          </h3>
                          {rfq.jobNameOrPo && rfq.title && rfq.title !== rfq.jobNameOrPo && (
                            <p className="text-sm text-zinc-500 mb-1">
                              {rfq.title}
                            </p>
                          )}
                          <p className="text-xs text-zinc-400 mb-2">
                            {rfq.rfqNumber}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-zinc-600">
                            <span>{(rfq.lineItems?.length || 0)} item{(rfq.lineItems?.length || 0) !== 1 ? "s" : ""}</span>
                            {/* Removed totalBids - will be loaded from database API when available */}
                            <span>{formatDate(rfq.createdAt)}</span>
                          </div>
                        </Link>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <Badge variant={statusVariant as any}>
                            {displayStatus}
                          </Badge>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(e, rfqId)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-500 hover:text-red-600"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
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
      <ConfirmDialog
        isOpen={deleteConfirmRfqId !== null}
        title="Delete Request"
        message="Delete this request? This will remove bids, messages, and PO records for this request."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export default function BuyerRFQsPage() {
  return (
    <Suspense fallback={null}>
      <BuyerRFQsPageInner />
    </Suspense>
  );
}