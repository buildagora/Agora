"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed localStorage imports - using APIs instead
import {
  Message,
  generateThreadId,
  migrateLegacyMessages,
  createSystemMessage,
  BuyerMessageIntent,
  getUnreadCountForThread,
} from "@/lib/messages";
import { autoResolveBuyerIntent, createAutoResponse } from "@/lib/autoResolution";
import { setRequestReviewStatus } from "@/lib/request";
import { useToast } from "@/components/Toast";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Badge from "@/components/ui2/Badge";

interface RFQ {
  id: string;
  rfqNumber: string;
  status: "OPEN" | "AWARDED" | "CLOSED";
  title: string;
  buyerId?: string;
  awardedBidId?: string;
}

export default function BuyerMessagesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rfqId = params.rfqId as string;
  const sellerId = searchParams.get("sellerId") || searchParams.get("s"); // Support both sellerId and s for brevity
  
  const [rfq, setRfq] = useState<RFQ | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sellerName, setSellerName] = useState("Seller");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [availableSellers, setAvailableSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<BuyerMessageIntent | "">("");
  const [optionalText, setOptionalText] = useState("");
  const [pageState, setPageState] = useState<"loading" | "no-context" | "ready" | "error">("no-context");
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { user } = useAuth(); // NEW FOUNDATION: Server is source of truth

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

  const loadData = () => {
    // GATE: Check for required context BEFORE attempting any loading
    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user) {
      setPageState("no-context");
      return;
    }

    // GATE: Check for required context: rfqId must be present
    if (!rfqId) {
      setPageState("no-context");
      return;
    }

    // NEW FOUNDATION: Load RFQ from API (server is source of truth)
    const loadRFQ = async () => {
      try {
        const res = await fetch(`/api/buyer/rfqs/${rfqId}`, {
          cache: "no-store",
          credentials: "include",
        });
        
        if (!res.ok) {
          if (res.status === 404) {
            setPageState("no-context");
            return;
          }
          throw new Error(`Failed to load RFQ: ${res.status}`);
        }
        
        const rfqData = await res.json();
        const foundRFQ = rfqData.ok ? rfqData.data : rfqData;
        setRfq(foundRFQ || null);

        if (!foundRFQ) {
          setPageState("no-context");
          return;
        }

        // TODO: Load bids from API when Bid model exists to get available sellers
        // For now, show empty seller list
        const sellers = new Map<string, string>();
        
        // If no sellerId provided, show seller picker (not a no-context state)
        // This is a valid state - user needs to select a seller
        if (!sellerId) {
          const sellerList = Array.from(sellers.entries()).map(([id, name]) => ({ id, name }));
          setAvailableSellers(sellerList);
          setPageState("ready");
          return; // Don't load messages yet - waiting for seller selection
        }

        // sellerId is provided - load the thread
        const targetSellerId = sellerId;
        
        // TODO: Load seller name from API when Bid/User models exist
        setSellerName("Seller");

        // Generate threadId
        // buyerId is required - use user.id as fallback (buyer viewing their own RFQ)
        const buyerId = foundRFQ.buyerId || user.id;
        
        // GATE: Final validation before loading messages
        if (!targetSellerId || !buyerId) {
          setThreadId(null);
          setMessages([]);
          setPageState("no-context");
          return;
        }
        
        const calculatedThreadId = generateThreadId(rfqId, buyerId, targetSellerId);
        setThreadId(calculatedThreadId);

        // Load messages for this thread from API
        setPageState("loading");
        
        // Set defensive timeout
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setPageState((current) => {
            if (current === "loading") {
              return "error";
            }
            return current;
          });
        }, 3000);

        try {
          const messagesRes = await fetch(`/api/buyer/messages/${rfqId}?sellerId=${targetSellerId}`, {
            cache: "no-store",
            credentials: "include",
          });
          
          if (messagesRes.ok) {
            const messagesData = await messagesRes.json();
            const threadMessages = messagesData.ok ? messagesData.data : (Array.isArray(messagesData) ? messagesData : []);
            setMessages(threadMessages);
            
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            
            setPageState("ready");
          } else {
            throw new Error(`Failed to load messages: ${messagesRes.status}`);
          }
        } catch (error) {
          console.error("Error loading messages:", error);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          setThreadId(null);
          setMessages([]);
          setPageState("error");
        }
      } catch (error) {
        console.error("Error loading RFQ:", error);
        setPageState("no-context");
        return;
      }
    };

    loadRFQ();
  };

  useEffect(() => {
    // Only attempt to load if we have minimum required context
    // Don't auto-load on mount if context is missing
    if (rfqId) {
      loadData();
    } else {
      setPageState("no-context");
    }
  }, [rfqId, sellerId]);

  useEffect(() => {
    // Mark messages as read when thread is opened
    // Only if we have a valid threadId (context is present)
    if (threadId && pageState === "ready") {
      // NEW FOUNDATION: Mark as read via API
      if (user) {
        // TODO: Call API to mark thread as read when Message model exists
        // For now, just reload data
        loadData();
      }
    }
  }, [threadId, pageState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Map intent to human-readable labels
  const intentLabels: Record<BuyerMessageIntent, string> = {
    REQUEST_UPDATE: "Request Update",
    ASK_LEAD_TIME: "Ask Lead Time",
    ASK_PRICE: "Ask Price",
    ASK_SUBSTITUTION: "Ask Substitution",
    CONFIRM_DETAILS: "Confirm Details",
    CANCEL_REQUEST: "Cancel Request",
  };

  // Map intent to message body prefix
  const intentBodyPrefixes: Record<BuyerMessageIntent, string> = {
    REQUEST_UPDATE: "Request for update",
    ASK_LEAD_TIME: "Question about lead time",
    ASK_PRICE: "Question about price",
    ASK_SUBSTITUTION: "Question about substitution",
    CONFIRM_DETAILS: "Request to confirm details",
    CANCEL_REQUEST: "Request to cancel",
  };

  // Handle sending intent-based message
  const handleSendIntentMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate intent is selected
    if (!selectedIntent) {
      setError("Please select a message intent");
      showToast({ type: "error", message: "Please select a message intent" });
      return;
    }

    // Validate optional text length
    const MAX_OPTIONAL_TEXT_LENGTH = 240;
    if (optionalText.length > MAX_OPTIONAL_TEXT_LENGTH) {
      setError(`Optional text cannot exceed ${MAX_OPTIONAL_TEXT_LENGTH} characters`);
      showToast({ type: "error", message: `Optional text cannot exceed ${MAX_OPTIONAL_TEXT_LENGTH} characters` });
      return;
    }

    if (!threadId) {
      setError("Missing required information");
      showToast({ type: "error", message: "Missing required information" });
      return;
    }

    // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
    if (!user) {
      setError("You must be logged in");
      showToast({ type: "error", message: "You must be logged in" });
      return;
    }

    // Extract IDs from threadId
    const threadIdMatch = threadId.match(/thread:rq=([^|]+)\|b=([^|]+)\|s=([^|]+)/);
    if (!threadIdMatch) {
      setError("Invalid thread ID");
      showToast({ type: "error", message: "Invalid thread ID" });
      return;
    }

    const requestId = threadIdMatch[1];
    const buyerId = threadIdMatch[2];
    const targetSellerId = threadIdMatch[3];

    // Build message body: intent prefix + optional text
    const bodyText = optionalText.trim()
      ? `${intentBodyPrefixes[selectedIntent]}: ${optionalText.trim()}`
      : intentBodyPrefixes[selectedIntent];

    try {
      // Create message with intent in metadata
      const messageData: Omit<Message, "threadId"> = {
        id: crypto.randomUUID(),
        rfqId: requestId,
        buyerId,
        sellerId: targetSellerId,
        fromRole: "BUYER",
        fromName: user?.companyName || "Buyer",
        senderId: user?.id || "",
        senderRole: "BUYER",
        body: bodyText,
        createdAt: new Date().toISOString(),
        readBy: user?.id ? [user.id] : [],
        seenByBuyerAt: new Date().toISOString(),
        seenBySellerAt: null,
        metadata: {
          intent: selectedIntent,
          ...(optionalText.trim() && { optionalText: optionalText.trim() }),
        },
      };

      // NEW FOUNDATION: Save message via API
      const messageRes = await fetch(`/api/buyer/messages/${rfqId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: bodyText,
          sellerId: targetSellerId,
          intent: selectedIntent,
          optionalText: optionalText.trim() || undefined,
        }),
      });
      
      if (!messageRes.ok) {
        throw new Error("Failed to send message");
      }
      
      const savedMessage: Message = { ...messageData, threadId }; // Use local messageData for UI update

      // Set request to "Pending Review" state (supplier not required to respond)
      // NOTE: Review status should be managed server-side via API
      await setRequestReviewStatus(requestId, "pending_review");

      // Try auto-resolution first
      const autoResolution = autoResolveBuyerIntent(savedMessage, targetSellerId);

      if (!autoResolution.shouldEscalate && autoResolution.autoResponse) {
        // Auto-resolved: create auto-response and skip seller notification
        createAutoResponse(threadId, savedMessage, autoResolution.autoResponse);

        // Still create acknowledgement for buyer peace of mind
        createSystemMessage(
          threadId,
          "Request received. Supplier reviewing.",
          {
            eventType: "BUYER_MESSAGE_ACKNOWLEDGED",
            requestId,
            buyerId,
            sellerId: targetSellerId,
            isAcknowledgement: true,
            isAutoResolved: true,
          }
        );

        // Mark acknowledgement as read via API (if supported)
        // TODO: When message read API is implemented, mark acknowledgement as read here
      } else {
        // Needs escalation: create acknowledgement and notify seller
        createSystemMessage(
          threadId,
          "Request received. Supplier reviewing.",
          {
            eventType: "BUYER_MESSAGE_ACKNOWLEDGED",
            requestId,
            buyerId,
            sellerId: targetSellerId,
            isAcknowledgement: true,
            needsEscalation: true,
            escalationReason: autoResolution.reason,
          }
        );

        // Mark acknowledgement as read via API (if supported)
        // TODO: When message read API is implemented, mark acknowledgement as read here

        // DO NOT send real-time notification to seller
        // Messages will be batched into summaries shown in Action Queue only
      }

      // Removed window event dispatch - notifications refresh via API fetch

      // Reset form
      setSelectedIntent("");
      setOptionalText("");
      setError(null);
      showToast({ type: "success", message: "Message sent" });
      loadData();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to send message";
      setError(errorMsg);
      showToast({ type: "error", message: errorMsg });
      console.error("Error sending intent message:", error);
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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  // Show error state (timeout or loading failure)
  if (pageState === "error") {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">
              Unable to load messages
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              There was a problem loading the conversation. Please try again.
            </p>
            <Link href="/buyer/messages">
              <Button variant="outline">Back to Messages</Button>
            </Link>
          </div>
        </div>
    );
  }

  // Show no-context state
  if (pageState === "no-context") {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">
              Messages unavailable
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Messages are tied to specific requests. Select a request or order to view messages.
            </p>
            {!sellerId && availableSellers.length > 0 && (
              <div className="mt-4 space-y-2">
                {availableSellers.map((seller) => (
                  <Link
                    key={seller.id}
                    href={`/buyer/messages/${rfqId}?sellerId=${seller.id}`}
                  >
                    <Button variant="outline" className="w-full">
                      Message {seller.name}
                    </Button>
                  </Link>
                ))}
              </div>
            )}
            <Link href="/buyer/messages" className="mt-4 inline-block">
              <Button variant="outline">Back to Messages</Button>
            </Link>
          </div>
        </div>
    );
  }

  // Show seller picker if sellerId is missing (but RFQ exists - this is a valid state)
  if (!sellerId || !threadId) {
    if (!rfq) {
      // Should not happen if pageState is "ready", but add safety check
      setPageState("no-context");
      return null;
    }
    
    return (
      <div className="flex flex-1 flex-col px-6 py-8 max-w-6xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              Messages — Request #{rfq.rfqNumber}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              {rfq.title}
            </p>
          </div>

          {availableSellers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                  No sellers have bid yet.
                </p>
                <Link href={`/buyer/rfqs/${rfqId}`}>
                  <Button variant="primary">Back to RFQ</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                  Select a seller to message
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {availableSellers.map((seller) => (
                    <Link
                      key={seller.id}
                      href={`/buyer/messages/${rfqId}?sellerId=${seller.id}`}
                    >
                      <div className="block p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-black dark:text-zinc-50">
                            {seller.name}
                          </span>
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            Message →
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
    );
  }

  // Safety check: if we're in ready state but rfq is missing, show no-context
  if (!rfq || !threadId) {
    setPageState("no-context");
    return null;
  }

  // Extract system messages for Activity panel
  const systemMessages = messages.filter((message) => {
    const senderRole = message.senderRole || message.fromRole || "BUYER";
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

  // Get unread count for current thread
  // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
  const unreadCount = threadId && user 
    ? getUnreadCountForThread(threadId, user.id)
    : 0;

  // Get status variant for badge
  const statusVariant = 
    rfq?.status === "AWARDED" ? "success" :
    rfq?.status === "CLOSED" ? "default" :
    "info";

  return (
    <div className="flex flex-1 h-full overflow-hidden">
        {/* Left Sidebar: Threads/Sellers */}
        <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Sellers
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Request #{rfq.rfqNumber}
            </p>
          </div>
          <div className="p-2">
            {availableSellers.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
                No sellers have bid yet.
              </div>
            ) : (
              <div className="space-y-1">
                {availableSellers.map((seller) => {
                  const isActive = seller.id === sellerId;
                  // NEW FOUNDATION: user comes from useAuth hook (server is source of truth)
                  const sellerThreadId = rfq && user 
                    ? generateThreadId(rfqId, user.id, seller.id)
                    : null;
                  const sellerUnreadCount = sellerThreadId && user
                    ? getUnreadCountForThread(sellerThreadId, user.id)
                    : 0;
                  
                  return (
                    <Link
                      key={seller.id}
                      href={`/buyer/messages/${rfqId}?sellerId=${seller.id}`}
                      className={`block p-3 rounded-lg transition-colors ${
                        isActive
                          ? "bg-slate-100 dark:bg-slate-800 text-black dark:text-zinc-50"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900 text-black dark:text-zinc-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{seller.name}</span>
                        {sellerUnreadCount > 0 && (
                          <Badge variant="info" className="text-xs">
                            {sellerUnreadCount}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
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
                    {sellerName}
                  </h1>
                  {unreadCount > 0 && (
                    <Badge variant="info" className="text-xs">
                      {unreadCount} unread
                    </Badge>
                  )}
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
              <Link href="/buyer/messages">
                <Button variant="outline" size="sm">
                  Back to Messages
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
            {(() => {
              // Filter out system messages - only show human-typed messages
              const humanMessages = messages.filter((message) => {
                const senderRole = message.senderRole || message.fromRole || "BUYER";
                return senderRole !== "SYSTEM";
              });
              
              return humanMessages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                humanMessages.map((message) => {
                  // Use canonical senderRole, fallback to legacy fromRole
                  const senderRole = message.senderRole || message.fromRole || "BUYER";
                  const isBuyer = senderRole === "BUYER";
                  
                  // Get sender name from user lookup or legacy fromName
                  let senderName = message.fromName;
                  if (!senderName) {
                    // Use message.fromName or fallback - user data comes from API
                    // TODO: Load sender from database API if needed
                    senderName = isBuyer ? "Buyer" : "Seller";
                  }
                
                return (
                  <div
                    key={message.id}
                    className={`flex ${isBuyer ? "justify-end" : "justify-start"} mb-1`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg p-4 shadow-sm ${
                        isBuyer
                          ? "bg-slate-600 dark:bg-slate-400 text-white dark:text-black"
                          : "bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 border border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <p className="text-sm font-semibold mb-1.5">{senderName}</p>
                      {/* Show intent label for buyer messages */}
                      {isBuyer && message.metadata?.intent && (
                        <p className="text-xs font-medium mb-2 opacity-90">
                          {intentLabels[message.metadata.intent as BuyerMessageIntent] || message.metadata.intent}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                      <p
                        className={`text-xs mt-2 ${
                          isBuyer
                            ? "text-slate-200 dark:text-zinc-700"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
              );
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Intent-based Message Composer (structured messaging) */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <form onSubmit={handleSendIntentMessage}>
            {error && (
              <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
            
            {/* Intent Selection (Required) */}
            <div className="mb-3">
              <label htmlFor="message-intent" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Message Intent <span className="text-red-500">*</span>
              </label>
              <select
                id="message-intent"
                value={selectedIntent}
                onChange={(e) => {
                  setSelectedIntent(e.target.value as BuyerMessageIntent | "");
                  setError(null);
                }}
                required
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
              >
                <option value="">Select an intent...</option>
                <option value="REQUEST_UPDATE">{intentLabels.REQUEST_UPDATE}</option>
                <option value="ASK_LEAD_TIME">{intentLabels.ASK_LEAD_TIME}</option>
                <option value="ASK_PRICE">{intentLabels.ASK_PRICE}</option>
                <option value="ASK_SUBSTITUTION">{intentLabels.ASK_SUBSTITUTION}</option>
                <option value="CONFIRM_DETAILS">{intentLabels.CONFIRM_DETAILS}</option>
                <option value="CANCEL_REQUEST">{intentLabels.CANCEL_REQUEST}</option>
              </select>
            </div>

            {/* Optional Text (Max 240 chars) */}
            <div className="mb-3">
              <label htmlFor="optional-text" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Additional Details <span className="text-zinc-500 dark:text-zinc-400 text-xs">(optional, max 240 chars)</span>
              </label>
              <textarea
                id="optional-text"
                value={optionalText}
                onChange={(e) => {
                  if (e.target.value.length <= 240) {
                    setOptionalText(e.target.value);
                    setError(null);
                  }
                }}
                rows={3}
                maxLength={240}
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50 resize-none"
                placeholder="Add any additional details (optional)..."
              />
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 text-right">
                {optionalText.length}/240
              </div>
            </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                disabled={!selectedIntent}
              >
                Send Message
              </Button>
              
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3 italic text-center">
                All buyer messages must have a structured intent. No free-form chat messages allowed.
              </p>
            </form>
          </div>
        </div>
      </div>
  );
}

