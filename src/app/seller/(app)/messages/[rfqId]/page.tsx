"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed pushNotification import - notifications will be created server-side via API
// Removed storage imports - using API calls instead
import {
  Message,
  generateThreadId,
  getThreadMessages,
  saveMessage,
  markThreadAsRead,
  migrateLegacyMessages,
  SupplierResponseAction,
} from "@/lib/messages";
import { setRequestReviewStatus } from "@/lib/request";
import { getRequest } from "@/lib/request";
// DO NOT IMPORT server-only modules here
// Use API routes instead
import { getOrderByRequestId } from "@/lib/order";
// Removed unused rfqToRequest import
import { detectAllExceptions, Exception } from "@/lib/exceptionDetection";
import { useToast } from "@/components/Toast";
import Button from "@/components/ui2/Button";
import Badge from "@/components/ui2/Badge";
import AppShell from "@/components/ui2/AppShell";

interface RFQ {
  id: string;
  rfqNumber: string;
  status: "OPEN" | "AWARDED" | "CLOSED";
  title: string;
  buyerId?: string;
}

export default function SellerMessagesPage() {
  const params = useParams();
  const rfqId = params.rfqId as string;
  const { user: currentUser, status } = useAuth();
  const [rfq, setRfq] = useState<RFQ | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedResponse, setSelectedResponse] = useState<SupplierResponseAction | "">("");
  const [optionalNote, setOptionalNote] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("Buyer");
  const [error, setError] = useState<string | null>(null);
  const [activeExceptions, setActiveExceptions] = useState<Exception[]>([]);
  const [pageState, setPageState] = useState<"loading" | "no-context" | "ready" | "error">("no-context");
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Run migration on mount
  useEffect(() => {
    migrateLegacyMessages();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  const loadData = async () => {
    // GATE: Check for required context BEFORE attempting any loading
    if (status === "loading") {
      return;
    }
    if (!currentUser || currentUser.role !== "SELLER") {
      setPageState("no-context");
      return;
    }

    // GATE: Check for required context: rfqId must be present
    if (!rfqId) {
      setPageState("no-context");
      return;
    }

    const sellerId = currentUser.id;
    let buyerId: string | null = null;
    let rfqTitle = "Request";
    let rfqNumber = rfqId.substring(0, 8);

    // PRIORITY 1: Load RFQ from API to get buyerId
    try {
      const rfqRes = await fetch(`/api/seller/rfqs/${rfqId}`, {
        credentials: "include",
      });
      if (rfqRes.ok) {
        const rfqData = await rfqRes.json();
        const foundRFQ = rfqData.data || rfqData;
        if (foundRFQ && foundRFQ.buyerId) {
          buyerId = foundRFQ.buyerId;
          rfqTitle = foundRFQ.title || "Request";
          rfqNumber = foundRFQ.rfqNumber || rfqId.substring(0, 8);
        }
      }
    } catch {
      // RFQ not found - continue
    }

    // PRIORITY 2: Load Order from API if RFQ didn't have buyerId
    if (!buyerId) {
      try {
        const orderRes = await fetch(`/api/buyer/orders?rfqId=${rfqId}`, {
          credentials: "include",
        });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          const orders = Array.isArray(orderData) ? orderData : (orderData.data || []);
          const order = orders.find((o: any) => o.rfqId === rfqId);
          if (order && order.buyerId) {
            buyerId = order.buyerId;
          }
        }
      } catch {
        // Order not found - continue
      }
    }

    // PRIORITY 4: Dispatch record (if seller was dispatched, try to get buyerId from request)
    if (!buyerId) {
      try {
        const res = await fetch(`/api/rfqs/${rfqId}/dispatch`, {
          credentials: "include",
        });
        const data = res.ok ? await res.json() : null;
        const dispatchRecords = data?.records || [];
        const sellerDispatch = dispatchRecords.find((r: any) => r.sellerId === sellerId);
        if (sellerDispatch) {
          // If we have a dispatch record, try to get buyerId from the request
          try {
            const request = await getRequest(rfqId, undefined, currentUser?.id);
            if (request && request.buyerId) {
              buyerId = request.buyerId;
            }
          } catch {
            // Request not found - continue
          }
        }
      } catch {
        // Silently continue
      }
    }

    // Load RFQ for display purposes (if not already loaded)
    let foundRFQ: RFQ | null = null;
    try {
      const rfqRes = await fetch(`/api/seller/rfqs/${rfqId}`, {
        credentials: "include",
      });
      foundRFQ = rfqRes.ok ? (await rfqRes.json()).data || null : null;
      if (foundRFQ) {
        rfqTitle = foundRFQ.title || rfqTitle;
        rfqNumber = foundRFQ.rfqNumber || rfqNumber;
      }
    } catch {
      // Silently continue
    }

    // Set RFQ state for display
    setRfq(foundRFQ || {
      id: rfqId,
      rfqNumber,
      status: "OPEN",
      title: rfqTitle,
      buyerId: buyerId || undefined,
    });

    // GATE: Final validation - Do NOT proceed with messaging if buyerId is missing
    // This prevents MESSAGING_CONTEXT_MISSING errors
    if (!buyerId) {
      setThreadId(null);
      setMessages([]);
      setPageState("no-context");
      return;
    }

    // GATE: All context checks passed - now we can attempt to load messages
    // Set loading state only when we're about to fetch
    setPageState("loading");

    // Set defensive timeout: if loading exceeds 3 seconds, show error
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    loadingTimeoutRef.current = setTimeout(() => {
      // If still loading after 3 seconds, show error state
      setPageState((current) => {
        if (current === "loading") {
          return "error";
        }
        return current;
      });
    }, 3000);

    // Get buyer name
    // TODO: Load buyer name from database API when available
    setBuyerName("Buyer");

    // Generate threadId with explicit buyerId
    const calculatedThreadId = generateThreadId(rfqId, buyerId, sellerId);
    setThreadId(calculatedThreadId);

    // Load messages for this thread (only called when all context is present)
    try {
      const threadMessages = getThreadMessages(calculatedThreadId, currentUser.id);
      setMessages(threadMessages);
      
      // Clear timeout since loading completed successfully
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      setPageState("ready");
    } catch {
      // Clear timeout since loading failed
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      setThreadId(null);
      setMessages([]);
      setPageState("error");
    }

    // Check for active exceptions that require seller response
    // Only show message composer if there are unresolved exceptions
    try {
      const request = await getRequest(rfqId, undefined, currentUser?.id);
      if (!request) {
        setActiveExceptions([]);
        return;
      }
      // Fetch dispatch records from API
      const dispatchRes = await fetch(`/api/rfqs/${rfqId}/dispatch`, {
        credentials: "include",
      });
      const dispatchData = dispatchRes.ok ? await dispatchRes.json() : null;
      const dispatchRecords = dispatchData?.records || [];
      const order = getOrderByRequestId(rfqId, sellerId);
      
      const exceptions = detectAllExceptions({
        request,
        dispatchRecords,
        order: order || null,
        now: new Date().toISOString(),
      });
      
      // Filter to only exceptions that require seller response and are unresolved
      const sellerExceptions = exceptions.filter((ex) => {
        if (ex.isResolved) return false;
        // Only show composer for exceptions where seller is involved
        if (ex.relatedIds.sellerId && ex.relatedIds.sellerId !== sellerId) return false;
        // CONFIRM_OVERDUE, SCHEDULE_OVERDUE, DELIVERY_OVERDUE require seller action
        return ex.type === "CONFIRM_OVERDUE" || ex.type === "SCHEDULE_OVERDUE" || ex.type === "DELIVERY_OVERDUE";
      });
      
      setActiveExceptions(sellerExceptions);
    } catch {
      // If we can't detect exceptions, don't show composer (default behavior)
      setActiveExceptions([]);
    }
  };

  useEffect(() => {
    // Only attempt to load if we have minimum required context
    // Don't auto-load on mount if context is missing
    if (rfqId) {
      loadData();
    } else {
      setPageState("no-context");
    }
  }, [rfqId]);

  useEffect(() => {
    // Mark messages as read when thread is opened
    // Only if we have a valid threadId (context is present)
    if (threadId && pageState === "ready") {
      if (currentUser) {
        markThreadAsRead(threadId, currentUser.id);
        loadData(); // Reload to reflect read status
        // Dispatch event to update header badge
        // Removed window event dispatch - notifications refresh via API fetch
      }
    }
  }, [threadId, pageState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Map response actions to message bodies
  const responseBodies: Record<SupplierResponseAction, string> = {
    QUOTE_SUBMITTED: "Quote submitted",
    NEED_CLARIFICATION: "Need clarification",
    UNABLE_TO_QUOTE: "Unable to quote",
    UPDATED_LEAD_TIME: "Updated lead time",
    UPDATED_PRICE: "Updated price",
    DECLINE_REQUEST: "Decline request",
  };

  const handleSendStructuredResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate response is selected
    if (!selectedResponse) {
      setError("Please select a response action");
      showToast({ type: "error", message: "Please select a response action" });
      return;
    }

    // Validate optional note length
    const MAX_NOTE_LENGTH = 240;
    if (optionalNote.length > MAX_NOTE_LENGTH) {
      setError(`Optional note cannot exceed ${MAX_NOTE_LENGTH} characters`);
      showToast({ type: "error", message: `Optional note cannot exceed ${MAX_NOTE_LENGTH} characters` });
      return;
    }

    if (!threadId) {
      const errorMsg = "Missing required information to send message";
      setError(errorMsg);
      showToast({ type: "error", message: errorMsg });
      return;
    }

    if (!currentUser || currentUser.role !== "SELLER") {
      const errorMsg = "You must be logged in as a seller to send messages";
      setError(errorMsg);
      showToast({ type: "error", message: errorMsg });
      return;
    }

    // Extract buyerId from threadId
    const threadIdMatch = threadId.match(/thread:rq=([^|]+)\|b=([^|]+)\|s=([^|]+)/);
    if (!threadIdMatch || !threadIdMatch[2]) {
      const errorMsg = "Invalid thread ID - cannot determine buyer";
      setError(errorMsg);
      showToast({ type: "error", message: errorMsg });
      return;
    }

    const sellerId = currentUser.id;
    const buyerId = threadIdMatch[2];
    const requestId = threadIdMatch[1];

    // Build message body: response action + optional note
    const bodyText = optionalNote.trim()
      ? `${responseBodies[selectedResponse]}: ${optionalNote.trim()}`
      : responseBodies[selectedResponse];

    // Create new message with structured response
    const messageData: Omit<Message, "threadId"> = {
      id: crypto.randomUUID(),
      rfqId: requestId,
      buyerId,
      sellerId,
      fromRole: "SELLER",
      fromName: currentUser.companyName || "Seller Co",
      senderId: currentUser.id,
      senderRole: "SELLER",
      body: bodyText,
      createdAt: new Date().toISOString(),
      readBy: [currentUser.id],
      seenBySellerAt: new Date().toISOString(),
      seenByBuyerAt: null,
      metadata: {
        responseAction: selectedResponse,
        ...(optionalNote.trim() && { optionalNote: optionalNote.trim() }),
      },
    };

    try {
      // Save message
      saveMessage(threadId, messageData);

      // Clear "Pending Review" status when supplier responds
      // NOTE: Review status should be managed server-side via API
      await setRequestReviewStatus(requestId, undefined);

      // Removed pushNotification call - notifications will be created server-side when message is sent via API
      // TODO: When /api/seller/messages/[rfqId] POST endpoint is implemented, it will create notifications server-side

      // Reset form
      setSelectedResponse("");
      setOptionalNote("");
      setError(null);
      showToast({ type: "success", message: "Response sent" });
      loadData();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to send response";
      setError(errorMsg);
      showToast({ type: "error", message: errorMsg });
      console.error("Error sending structured response:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Show loading state
  if (pageState === "loading") {
    return (
      <div className="flex flex-1 px-6 py-8">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state (timeout or loading failure)
  if (pageState === "error") {
    return (
      <div className="flex flex-1 px-6 py-8">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">
              Unable to load messages
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              There was a problem loading the conversation. Please try again.
            </p>
            <Link href="/seller/messages">
              <Button variant="outline">Back to Action Queue</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show no-context state
  if (pageState === "no-context") {
    return (
      <div className="flex flex-1 px-6 py-8">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">
              Messages unavailable
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Messages are tied to specific requests. Select a request or order to view messages.
            </p>
            <Link href="/seller/messages">
              <Button variant="outline">Back to Action Queue</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Safety check: if we're in ready state but rfq or threadId is missing, show no-context
  if (!rfq || !threadId) {
    setPageState("no-context");
    return null;
  }

  // Extract system messages for Activity panel
  const systemMessages = messages.filter((message) => {
    const senderRole = message.senderRole || message.fromRole || "SELLER";
    return senderRole === "SYSTEM";
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Helper to format activity labels from system messages
  const getActivityLabel = (message: Message): string => {
    const eventType = message.metadata?.eventType;
    if (eventType === "REQUEST_POSTED" || eventType === "REQUEST_CREATED") {
      return "Request created";
    } else if (eventType === "BID_SUBMITTED") {
      return "Bid submitted";
    } else if (eventType === "ORDER_AWARDED") {
      return "Order awarded";
    } else if (eventType === "ORDER_CONFIRMED") {
      return "Order confirmed";
    } else if (eventType === "ORDER_SCHEDULED") {
      return "Order scheduled";
    } else if (eventType === "ORDER_DELIVERED") {
      return "Order delivered";
    } else if (eventType === "ORDER_CANCELLED") {
      return "Order cancelled";
    }
    // Fallback to message body for unknown event types
    return message.body.length > 60 ? message.body.substring(0, 60) + "..." : message.body;
  };

  // Helper to get status badge for current RFQ/Order state
  const getStatusBadge = (): string | null => {
    if (rfq?.status === "AWARDED") return "Awarded";
    if (rfq?.status === "CLOSED") return "Closed";
    return rfq?.status === "OPEN" ? "Open" : null;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Get status variant for badge
  const statusVariant = 
    rfq?.status === "AWARDED" ? "success" :
    rfq?.status === "CLOSED" ? "default" :
    "info";

  return (
    <AppShell role="seller" active="messages">
      <div className="flex flex-1 h-full overflow-hidden">
        {/* Left Sidebar: Action Queue Link */}
        <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Action Queue
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Request #{rfq.rfqNumber}
            </p>
          </div>
          <div className="p-4">
            <Link href="/seller/messages">
              <Button variant="outline" className="w-full">
                ← Back to Action Queue
              </Button>
            </Link>
          </div>
        </div>

        {/* Main Conversation Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Conversation Header */}
          <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-semibold text-black dark:text-zinc-50 truncate">
                    {buyerName}
                  </h1>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Request #{rfq.rfqNumber}
                  </span>
                  {getStatusBadge() && (
                    <Badge variant={statusVariant} className="text-xs">
                      {getStatusBadge()}
                    </Badge>
                  )}
                </div>
              </div>
              <Link href="/seller/messages">
                <Button variant="outline" size="sm">
                  Back to Action Queue
                </Button>
              </Link>
            </div>
          </div>

          {/* Activity Panel */}
          {systemMessages.length > 0 && (
            <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-black dark:text-zinc-50 mb-3">
                  Request Activity
                </h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {systemMessages.map((message) => (
                    <div
                      key={message.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600 mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-black dark:text-zinc-50 font-medium">
                          {getActivityLabel(message)}
                        </p>
                        <p className="text-zinc-500 dark:text-zinc-500 mt-0.5">
                          {formatDateTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50 dark:bg-black">
            {messages.filter((m) => (m.senderRole || m.fromRole || "SELLER") !== "SYSTEM").length === 0 ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400">
                  No messages. Messaging is only available for exception handling.
                </p>
              </div>
            ) : (
              messages
                .filter((m) => (m.senderRole || m.fromRole || "SELLER") !== "SYSTEM")
                .map((message) => {
                  const senderRole = message.senderRole || message.fromRole || "SELLER";
                  const isSeller = senderRole === "SELLER";

                  let senderName = message.fromName;
                  if (!senderName) senderName = isSeller ? "Seller" : "Buyer";

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isSeller ? "justify-end" : "justify-start"} mb-1`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg p-4 shadow-sm ${
                          isSeller
                            ? "bg-slate-600 dark:bg-slate-400 text-white dark:text-black"
                            : "bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700"
                        }`}
                      >
                        <p className="text-sm font-semibold mb-1.5">{senderName}</p>

                        {isSeller && (message as any).metadata?.responseAction && (
                          <p className="text-xs font-medium mb-2 opacity-90">
                            {responseBodies[(message as any).metadata.responseAction as SupplierResponseAction] ||
                              (message as any).metadata.responseAction}
                          </p>
                        )}

                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                        <p
                          className={`text-xs mt-2 ${
                            isSeller ? "text-slate-200 dark:text-zinc-700" : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Structured Response Composer */}
          {activeExceptions.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                  Exception Handling Required
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {activeExceptions.map((ex) => ex.message).join(" • ")}
                </p>
              </div>
              <form onSubmit={handleSendStructuredResponse}>
                {error && (
                  <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                    {error}
                  </div>
                )}

                {/* Response Action Selection (Required) */}
                <div className="mb-3">
                  <label htmlFor="response-action" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Response Action <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="response-action"
                    value={selectedResponse}
                    onChange={(e) => {
                      setSelectedResponse(e.target.value as SupplierResponseAction | "");
                      setError(null);
                    }}
                    required
                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                  >
                    <option value="">Select a response...</option>
                    <option value="QUOTE_SUBMITTED">Quote submitted</option>
                    <option value="NEED_CLARIFICATION">Need clarification</option>
                    <option value="UNABLE_TO_QUOTE">Unable to quote</option>
                    <option value="UPDATED_LEAD_TIME">Updated lead time</option>
                    <option value="UPDATED_PRICE">Updated price</option>
                    <option value="DECLINE_REQUEST">Decline request</option>
                  </select>
                </div>

                {/* Optional Note */}
                <div className="mb-3">
                  <label htmlFor="optional-note" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Additional Note <span className="text-zinc-500 dark:text-zinc-400 text-xs">(optional, max 240 chars)</span>
                  </label>
                  <textarea
                    id="optional-note"
                    value={optionalNote}
                    onChange={(e) => {
                      if (e.target.value.length <= 240) {
                        setOptionalNote(e.target.value);
                        setError(null);
                      }
                    }}
                    rows={3}
                    maxLength={240}
                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50 resize-none"
                    placeholder="Add any additional details (optional)..."
                  />
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 text-right">
                    {optionalNote.length}/240
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full"
                  disabled={!selectedResponse}
                >
                  Send Response
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

