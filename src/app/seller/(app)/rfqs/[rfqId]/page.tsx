"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import SmartBackButton from "@/components/nav/SmartBackButton";
// Removed pushNotification import - notifications will be created server-side via API
// PO actions now handled by PurchaseOrderActions component
import { useAuth } from "@/lib/auth/AuthProvider";
import { enforceRoleClient } from "@/lib/auth/requireRoleClient";
// Removed localStorage imports - using APIs instead
import { generateThreadId, createSystemMessage } from "@/lib/messages";
// DO NOT IMPORT server-only modules here
// Use API routes instead
import { getOrderByRequestId, updateOrderStatus, type Order } from "@/lib/order";
import { logEvent } from "@/lib/eventLog";
import { getRequest } from "@/lib/request";
import { detectExceptionsForOrder, type Exception } from "@/lib/exceptionDetection";
import { useToast, ToastContainer } from "@/components/Toast";
import PurchaseOrderActions from "@/components/PurchaseOrderActions";
import Header from "@/components/Header";
import Badge from "@/components/ui2/Badge";
import Button from "@/components/ui2/Button";
import RFQClarifications from "./RFQClarifications";
import { trackEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

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
  category: string;
  buyerId?: string; // Buyer who created this RFQ
  jobNameOrPo?: string; // Job name or PO number for organization
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

export default function SellerRFQDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser, status } = useAuth();
  const id = params.rfqId as string;
  const [rfq, setRfq] = useState<RFQ | null>(null);
  
  // Build fallback URL to feed, preserving category from RFQ or URL params
  const getFeedFallback = () => {
    const category = rfq?.category || searchParams.get("category") || searchParams.get("categoryId");
    return category 
      ? `/seller/feed?category=${encodeURIComponent(category)}`
      : "/seller/feed";
  };
  const [existingBid, setExistingBid] = useState<Bid | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBidForm, setShowBidForm] = useState(false);
  const hasTrackedQuoteStarted = useRef(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const { showToast, toasts, removeToast } = useToast();
  const [orderError, setOrderError] = useState<string | null>(null);
  
  // Determine page mode: "view" if bid exists, "create" if not
  const mode = existingBid ? "view" : "create";

  // Bid form state
  const [bidLineItems, setBidLineItems] = useState<BidLineItem[]>([]);
  const [bidNotes, setBidNotes] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [bidErrors, setBidErrors] = useState<{
    lineItems: string[];
    notes: string;
    leadTimeDays: string;
  }>({ lineItems: [], notes: "", leadTimeDays: "" });

  useEffect(() => {
    // Wait for auth to load
    if (status === "loading") {
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    // NEW FOUNDATION: Load RFQ from API (server is source of truth)
    const loadRFQ = async () => {
      try {
        const res = await fetch(`/api/seller/rfqs/${id}`, {
          cache: "no-store",
          credentials: "include",
        });
        
        if (!res.ok) {
          if (res.status === 404) {
            setRfq(null);
            setLoading(false);
            return;
          }
          throw new Error(`Failed to load RFQ: ${res.status}`);
        }
        
        const rfqData = await res.json();
        const foundRFQ = rfqData.ok ? rfqData.data : rfqData;
        
        setRfq(foundRFQ);
        // Initialize bid line items from RFQ with quantities autopopulated
        setBidLineItems(
          foundRFQ.lineItems.map((item: LineItem) => ({
            description: item.description,
            unit: item.unit,
            quantity: item.quantity.toString(), // Autopopulate from RFQ
            unitPrice: "",
          }))
        );
      } catch (error) {
        console.error("Error loading RFQ:", error);
        setRfq(null);
        setLoading(false);
        return;
      }
    };

    // Load seller's bid for this RFQ from API
    const loadBid = async () => {
      try {
        const res = await fetch(`/api/seller/bids/${id}`, {
          cache: "no-store",
          credentials: "include",
        });
        
        if (res.ok) {
          const bidData = await res.json();
          const foundBid = bidData.ok ? bidData.data : bidData;
          if (foundBid) {
            setExistingBid(foundBid);
          }
        }
      } catch (error) {
        console.error("Error loading bid:", error);
      }
    };

    loadRFQ();
    loadBid();

    // TODO: Load Order from API when Order model exists
    setOrder(null);
    setExceptions([]); // Exceptions disabled until Order model exists

    // Mark WON bids as seen via API (if bid exists and is WON)
    // This will be handled after bid is loaded
    const markBidAsSeen = async () => {
      if (existingBid && existingBid.status === "WON" && !existingBid.seenBySellerAt) {
        try {
          await fetch(`/api/seller/bids/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ seenBySellerAt: new Date().toISOString() }),
          });
        } catch (error) {
          // Silently fail - marking as seen is not critical
          if (process.env.NODE_ENV === "development") {
            console.error("Error marking bid as seen:", error);
          }
        }
      }
    };
    
    // Call after bid is loaded
    loadBid().then(() => markBidAsSeen());

    // PO loading is now handled by PurchaseOrderActions component

    setLoading(false);
  }, [id]);

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format numeric string with commas for display only
  const formatNumberWithCommas = (value: string): string => {
    if (!value || value.trim() === "") {
      return "";
    }
    // Strip existing commas
    const cleaned = value.replace(/,/g, "");
    
    // Handle edge cases: empty, just decimal point
    if (cleaned === "" || cleaned === ".") {
      return cleaned;
    }
    
    // Split into integer and decimal parts
    const parts = cleaned.split(".");
    const integerPart = parts[0] || "";
    const decimalPart = parts.length > 1 ? "." + parts[1] : "";
    
    // Format integer part with commas (only if >= 1000)
    let formattedInteger = integerPart;
    if (integerPart && integerPart.length > 0) {
      try {
        const num = parseInt(integerPart, 10);
        if (!isNaN(num) && num >= 1000) {
          formattedInteger = num.toLocaleString("en-US");
        }
      } catch {
        // Fallback: keep original if formatting fails
      }
    }
    
    return formattedInteger + decimalPart;
  };

  // Strip commas from numeric string for storage/calculation
  const stripCommas = (value: string): string => {
    return value.replace(/,/g, "");
  };

  // Format number as currency with commas and 2 decimal places
  const formatCurrency = (value: number): string => {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const scrollToBidForm = () => {
    if (!hasTrackedQuoteStarted.current) {
      hasTrackedQuoteStarted.current = true;
      trackEvent(ANALYTICS_EVENTS.quote_started, {
        context: "seller",
        rfq_present: true,
      });
    }
    setShowBidForm(true);
    setTimeout(() => {
      const formElement = document.getElementById("bid-form");
      formElement?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const updateBidLineItem = (
    index: number,
    field: keyof BidLineItem,
    value: string
  ) => {
    const updated = [...bidLineItems];
    updated[index][field] = value;
    setBidLineItems(updated);
  };

  const validateBid = (): boolean => {
    const errors: { lineItems: string[]; notes: string; leadTimeDays: string } = {
      lineItems: [],
      notes: "",
      leadTimeDays: "",
    };
    let isValid = true;

    // Validate at least one line item has quantity and unitPrice
    let hasValidLineItem = false;
    bidLineItems.forEach((item, index) => {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);

      if (item.quantity.trim() && item.unitPrice.trim()) {
        if (qty <= 0 || isNaN(qty)) {
          errors.lineItems[index] = "Quantity must be greater than 0";
          isValid = false;
        } else if (price < 0 || isNaN(price)) {
          errors.lineItems[index] = "Unit price must be 0 or greater";
          isValid = false;
        } else {
          hasValidLineItem = true;
        }
      }
    });

    if (!hasValidLineItem) {
      errors.lineItems[0] = "At least one line item must have quantity and unit price";
      isValid = false;
    }

    // Validate leadTimeDays (required, must be > 0)
    const leadTime = parseFloat(leadTimeDays);
    if (!leadTimeDays.trim()) {
      errors.leadTimeDays = "Lead time is required";
      isValid = false;
    } else if (isNaN(leadTime) || leadTime <= 0) {
      errors.leadTimeDays = "Lead time must be greater than 0";
      isValid = false;
    }

    setBidErrors(errors);
    return isValid;
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBid()) {
      return;
    }

    // Filter to only line items with values
    // Ensure quantity is included even if disabled (use RFQ quantity or fallback to 1)
    const validLineItems = bidLineItems
      .map((item, index) => ({
        ...item,
        quantity: item.quantity.trim() || (rfq?.lineItems[index]?.quantity.toString() || "1"),
      }))
      .filter(
        (item) =>
          item.quantity.trim() &&
          item.unitPrice.trim() &&
          parseFloat(item.quantity) > 0 &&
          parseFloat(item.unitPrice) >= 0
      );

    // Calculate totals
    const lineItemsTotal = validLineItems.reduce((sum, item) => {
      // Guard: if quantity is missing/null, fallback to 1
      const qty = parseFloat(item.quantity) || 1;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);

    const deliveryChargeValue = rfq?.terms.fulfillmentType === "DELIVERY" && deliveryCharge.trim()
      ? parseFloat(deliveryCharge) || 0
      : undefined;

    const total = deliveryChargeValue !== undefined
      ? lineItemsTotal + deliveryChargeValue
      : lineItemsTotal;

    // CRITICAL: Do not route to /auth/sign-in here; preserve deep link via role-specific login + returnTo (AuthGuard invariant).
    if (!enforceRoleClient({
      userRole: currentUser?.role ?? null,
      requiredRole: "SELLER",
      routerReplace: router.replace,
    })) {
      showToast({ type: "error", message: "You must be logged in as a seller to submit a bid." });
      return;
    }
    if (!currentUser) {
      showToast({ type: "error", message: "You must be logged in as a seller." });
      return;
    }
    const sellerName = currentUser.companyName;

    // Parse leadTimeDays (validated in validateBid, so safe to parse here)
    const leadTimeDaysValue = parseFloat(leadTimeDays);

    // Save bid via API (server is source of truth)
    let savedBid: Bid | null = null;
    try {
      const res = await fetch(`/api/seller/bids/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lineItems: validLineItems,
          notes: bidNotes,
          leadTimeDays: leadTimeDaysValue,
          deliveryCharge: deliveryChargeValue,
          total,
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to submit bid: ${res.status}`);
      }
      
      const bidData = await res.json();
      savedBid = bidData.ok ? bidData.data : bidData;
      
      // Update existing bid state with server response
      setExistingBid(savedBid);
      
      // Dev log: Bid persisted
      if (process.env.NODE_ENV === "development" && savedBid) {
        console.log("💾 BID_SUBMIT_PERSISTED", {
          bidId: savedBid.id,
          rfqId: savedBid.rfqId,
          buyerId: savedBid.buyerId,
          sellerId: savedBid.sellerId,
          total: savedBid.total,
        });
      }
    } catch (error) {
      console.error("Error submitting bid:", error);
      showToast({ type: "error", message: "Failed to submit bid. Please try again." });
      return;
    }

    if (!savedBid) {
      return;
    }

    // Notifications are now created server-side by the API endpoint
    // No client-side notification glue needed

    // Redirect to dashboard with success flag
    router.push("/seller/dashboard?success=bid_submitted");
  };

  const calculateTotal = (): number => {
    const lineItemsTotal = bidLineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);

    const deliveryChargeValue = rfq?.terms.fulfillmentType === "DELIVERY" && deliveryCharge.trim()
      ? parseFloat(deliveryCharge) || 0
      : 0;

    return lineItemsTotal + deliveryChargeValue;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </main>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-black">
        <Header />
        <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
          <div className="w-full">
            <div className="mt-8 text-center">
              <p className="text-zinc-600 dark:text-zinc-400">RFQ not found.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      {/* Main content */}
      <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="w-full">
          {/* Back to Live Feed link - uses smart back navigation */}
          <div className="mb-4">
            <SmartBackButton
              fallback={getFeedFallback()}
              label="← Back to Live Feed"
            />
          </div>

          {/* V1 FIX: Page Header - Job Name/PO as primary identifier */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-1">
              {rfq.jobNameOrPo || rfq.title || "Material Request"}
            </h1>
            {rfq.jobNameOrPo && rfq.title && rfq.title !== rfq.jobNameOrPo && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                {rfq.title}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {rfq.rfqNumber}
              </p>
              <Badge variant={rfq.status === "OPEN" ? "info" : rfq.status === "AWARDED" ? "success" : "default"}>
                {rfq.status}
              </Badge>
              {rfq.category && (
                <Badge variant="default">{rfq.category}</Badge>
              )}
            </div>
          </div>

          {/* Order Status Header - Inline component at top */}
          {order && (
            <div className="mb-6 p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                {/* Left: Status Badge */}
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Order Status</p>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-black dark:text-zinc-50">
                        {order.status === "delivered" ? "Delivered" :
                         order.status === "picked_up" ? "Picked Up" :
                         order.status === "scheduled" ? "Scheduled" :
                         order.status === "confirmed" ? "Confirmed" :
                         order.status === "awarded" ? "Awarded" :
                         order.status === "cancelled" ? "Cancelled" :
                         order.status}
                      </p>
                      <Badge 
                        variant={
                          order.status === "delivered" || order.status === "picked_up" ? "success" :
                          order.status === "confirmed" || order.status === "scheduled" ? "info" :
                          order.status === "cancelled" ? "error" :
                          "default"
                        }
                      >
                        {order.status === "delivered" ? "Delivered" :
                         order.status === "picked_up" ? "Picked Up" :
                         order.status === "scheduled" ? "Scheduled" :
                         order.status === "confirmed" ? "Confirmed" :
                         order.status === "awarded" ? "Awarded" :
                         order.status === "cancelled" ? "Cancelled" :
                         order.status}
                      </Badge>
                    </div>
                    {/* Last updated timestamp */}
                    {order.statusHistory.length > 0 && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                        Last updated: {new Date(order.statusHistory[order.statusHistory.length - 1].at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Primary Actions */}
                <div className="flex gap-2">
                  {(() => {
                    // Branch actions by fulfillment type (DELIVERY vs PICKUP)
                    const fulfillmentMode = order.fulfillmentMode || (rfq?.terms.fulfillmentType === "PICKUP" ? "pickup" : rfq?.terms.fulfillmentType === "DELIVERY" ? "delivery" : "unknown");
                    const isPickup = fulfillmentMode === "pickup";

                    // DELIVERY flow actions
                    const deliveryActions: Record<string, Array<{ status: string; label: string; variant: "primary" | "outline" | "error" }>> = {
                      awarded: [
                        { status: "confirmed", label: "Confirm Order", variant: "primary" },
                        { status: "cancelled", label: "Cancel", variant: "error" },
                      ],
                      confirmed: [
                        { status: "scheduled", label: "Mark Scheduled", variant: "primary" },
                        { status: "cancelled", label: "Cancel", variant: "error" },
                      ],
                      scheduled: [
                        { status: "delivered", label: "Mark Delivered", variant: "primary" },
                        { status: "cancelled", label: "Cancel", variant: "error" },
                      ],
                    };

                    // PICKUP flow actions
                    const pickupActions: Record<string, Array<{ status: string; label: string; variant: "primary" | "outline" | "error" }>> = {
                      awarded: [
                        { status: "confirmed", label: "Confirm Order", variant: "primary" },
                        { status: "cancelled", label: "Cancel", variant: "error" },
                      ],
                      confirmed: [
                        { status: "picked_up", label: "Mark Picked Up", variant: "primary" },
                        { status: "cancelled", label: "Cancel", variant: "error" },
                      ],
                    };

                    const validActions = isPickup ? pickupActions : deliveryActions;
                    const actions = validActions[order.status] || [];

                    if (actions.length === 0) {
                      return (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {order.status === "delivered" 
                            ? "Order delivered"
                            : order.status === "picked_up"
                            ? "Order picked up"
                            : "Order cancelled"}
                        </p>
                      );
                    }

                    return (
                      <>
                        {orderError && (
                          <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-800 dark:text-red-200">{orderError}</p>
                          </div>
                        )}
                        {actions.map((action) => {
                          const handleClick = async () => {
                            if (!currentUser || !rfq) return;
                            setOrderError(null);

                            try {
                              const statusMessages: Record<string, string> = {
                                confirmed: "Order confirmed by supplier",
                                scheduled: "Order scheduled",
                                delivered: "Order delivered",
                                picked_up: "Order picked up",
                                cancelled: "Order cancelled by supplier",
                              };

                              const updatedOrder = updateOrderStatus(
                                order.id,
                                action.status as any,
                                currentUser.id,
                                statusMessages[action.status] || `Order status updated to ${action.status}`
                              );

                              if (updatedOrder) {
                                setOrder(updatedOrder);

                                // Send system message to buyer-seller thread
                                if (rfq.buyerId && currentUser.id) {
                                  const threadId = generateThreadId(id, rfq.buyerId, currentUser.id);
                                  const systemMessages: Record<string, string> = {
                                    confirmed: "Order confirmed by supplier",
                                    scheduled: "Order status updated: Scheduled",
                                    delivered: "Order status updated: Delivered",
                                    picked_up: "Order status updated: Picked Up",
                                    cancelled: "Order status updated: Cancelled",
                                  };
                                  createSystemMessage(
                                    threadId,
                                    systemMessages[action.status] || `Order status updated: ${action.status}`,
                                    {
                                      eventType: action.status === "confirmed" ? "ORDER_CONFIRMED" : "ORDER_STATUS_UPDATED",
                                      orderId: order.id,
                                      requestId: id,
                                      status: action.status,
                                    }
                                  );
                                }

                                const successMessages: Record<string, string> = {
                                  confirmed: "Order confirmed successfully!",
                                  scheduled: "Order marked as scheduled!",
                                  delivered: "Order marked as delivered!",
                                  picked_up: "Order marked as picked up!",
                                  cancelled: "Order cancelled.",
                                };
                                showToast({ type: "success", message: successMessages[action.status] || "Order status updated!" });
                              }
                            } catch (error) {
                              let userFriendlyMessage = "Failed to update order status";
                              
                              if (error instanceof Error) {
                                const errorText = error.message;
                                
                                if (errorText.includes("Invalid status transition")) {
                                  const fromMatch = errorText.match(/from "(\w+)"/);
                                  const toMatch = errorText.match(/to "(\w+)"/);
                                  
                                  if (fromMatch && toMatch) {
                                    const fromStatus = fromMatch[1];
                                    const toStatus = toMatch[1];
                                    
                                    if (fromStatus === "confirmed" && toStatus === "delivered") {
                                      userFriendlyMessage = "You can't mark this as delivered yet. Mark it as scheduled first.";
                                    } else if (fromStatus === "awarded" && toStatus === "delivered") {
                                      userFriendlyMessage = "You can't mark this as delivered yet. Confirm the order first, then mark it as scheduled.";
                                    } else if (fromStatus === "awarded" && toStatus === "scheduled") {
                                      userFriendlyMessage = "You can't mark this as scheduled yet. Confirm the order first.";
                                    } else if (fromStatus === "delivered" && toStatus) {
                                      userFriendlyMessage = "This order has already been delivered. No further changes are allowed.";
                                    } else if (fromStatus === "cancelled" && toStatus) {
                                      userFriendlyMessage = "This order has been cancelled. No further changes are allowed.";
                                    } else {
                                      userFriendlyMessage = `You can't change the order status from ${fromStatus} to ${toStatus}. Please follow the correct workflow.`;
                                    }
                                  } else {
                                    userFriendlyMessage = "This status change is not allowed. Please follow the correct order workflow.";
                                  }
                                } else {
                                  userFriendlyMessage = errorText;
                                }
                              }
                              
                              setOrderError(userFriendlyMessage);
                              showToast({ type: "error", message: userFriendlyMessage });
                            }
                          };

                          return (
                            <Button
                              key={action.status}
                              variant={action.variant === "error" ? "outline" : action.variant}
                              size="md"
                              onClick={handleClick}
                            >
                              {action.label}
                            </Button>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Purchase Order Section - PO details + Download/Email only */}
          <PurchaseOrderActions rfqId={id} role="SELLER" rfq={rfq} />

          {/* Clarifications Section - RFQ-scoped messaging */}
          <div className="mb-8">
            <RFQClarifications rfqId={id} />
          </div>

          {/* Buyer Notes */}
          {rfq.notes?.trim() && (
            <div className="mb-6 p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-500 mb-2">
                Buyer Notes
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                {rfq.notes}
              </p>
            </div>
          )}

          {/* Line Items */}
          <div className="flex flex-col gap-6 mb-8">
            <div>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
                Line Items
              </h2>
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                        Unit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {rfq.lineItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-black dark:text-zinc-50">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-black dark:text-zinc-50">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-black dark:text-zinc-50">
                          {item.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Job Name / PO # */}
            {rfq.jobNameOrPo && (
              <div className="mb-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  Job Name / PO #
                </p>
                <p className="text-black dark:text-zinc-50">
                  {rfq.jobNameOrPo}
                </p>
              </div>
            )}

            {/* Required Terms (Read-only) */}
            <div>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
                Required Terms
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    Fulfillment Type
                  </p>
                  <p className="text-black dark:text-zinc-50">
                    {rfq.terms.fulfillmentType}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                    {rfq.terms.fulfillmentType === "PICKUP" ? "Pickup Date" : "Requested Delivery Date"}
                  </p>
                  <p className="text-black dark:text-zinc-50">
                    {formatDateShort(rfq.terms.requestedDate)}
                  </p>
                </div>
                {rfq.terms.fulfillmentType === "DELIVERY" && (
                  <>
                    <div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                        Delivery Preference
                      </p>
                      <p className="text-black dark:text-zinc-50">
                        {rfq.terms.deliveryPreference || "ANYTIME"}
                      </p>
                    </div>
                    {rfq.terms.deliveryInstructions && (
                      <div className="md:col-span-2">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                          Special Delivery Instructions
                        </p>
                        <p className="text-black dark:text-zinc-50 whitespace-pre-wrap">
                          {rfq.terms.deliveryInstructions}
                        </p>
                      </div>
                    )}
                    {rfq.terms.location && (
                      <div className="md:col-span-2">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                          Delivery Address
                        </p>
                        <p className="text-black dark:text-zinc-50">
                          {rfq.terms.location}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Place Bid Button - Only show if seller hasn't submitted a bid yet */}
            {mode === "create" && rfq.status === "OPEN" && !showBidForm && (
              <div>
                <button
                  onClick={scrollToBidForm}
                  className="px-6 py-3 bg-black dark:bg-zinc-50 text-white dark:text-black rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 font-medium"
                >
                  Place Bid
                </button>
              </div>
            )}
            {mode === "create" && rfq.status !== "OPEN" && !showBidForm && (
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                  Bidding is closed for this request.
                </p>
              </div>
            )}
          </div>

          {/* Bid Details Section - Collapsible (collapsed by default) */}
          {mode === "view" && existingBid && (
            <details className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                    Submitted Bid (optional)
                  </h2>
                  <span className="text-sm text-zinc-500 dark:text-zinc-500">Click to expand</span>
                </div>
              </summary>
              
              <div className="mt-6 flex flex-col gap-6">
                {/* Bid Status and Timestamp */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Bid Status
                    </p>
                    <p className="text-black dark:text-zinc-50 font-medium">
                      {existingBid.status === "WON" && (
                        <span className="text-green-600 dark:text-green-400">Won</span>
                      )}
                      {existingBid.status === "LOST" && (
                        <span className="text-red-600 dark:text-red-400">Lost</span>
                      )}
                      {(!existingBid.status || existingBid.status === "SUBMITTED") && (
                        <span className="text-blue-600 dark:text-blue-400">Submitted</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      Submitted
                    </p>
                    <p className="text-black dark:text-zinc-50">
                      {formatDateShort(existingBid.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                    Line Items
                  </h3>
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-zinc-50 dark:bg-zinc-900">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                            Description
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                            Unit
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-black dark:text-zinc-50">
                            Unit Price
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-black dark:text-zinc-50">
                            Line Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {(existingBid.lineItems || []).map((item, index) => {
                          const qty = parseFloat(item.quantity) || 0;
                          const unitPrice = parseFloat(item.unitPrice) || 0;
                          const lineTotal = qty * unitPrice;
                          return (
                            <tr key={index} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                              <td className="px-4 py-3 text-black dark:text-zinc-50">
                                {item.description}
                              </td>
                              <td className="px-4 py-3 text-black dark:text-zinc-50">
                                {qty.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-black dark:text-zinc-50">
                                {item.unit}
                              </td>
                              <td className="px-4 py-3 text-black dark:text-zinc-50">
                                ${formatCurrency(unitPrice)}
                              </td>
                              <td className="px-4 py-3 text-right text-black dark:text-zinc-50 font-medium">
                                ${formatCurrency(lineTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lead Time */}
                {existingBid.leadTimeDays !== undefined && (
                  <div>
                    <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                      Lead Time
                    </h3>
                    <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                      <p className="text-black dark:text-zinc-50">
                        <span className="font-medium">{existingBid.leadTimeDays}</span> day{existingBid.leadTimeDays !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* Bid Totals */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                  <div className="flex flex-col gap-2 max-w-md ml-auto">
                    <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                      <span>Line Items Total:</span>
                      <span>
                        $
                        {formatCurrency(
                          (existingBid.lineItems || []).reduce((sum, item) => {
                            const qty = parseFloat(item.quantity) || 0;
                            const price = parseFloat(item.unitPrice) || 0;
                            return sum + qty * price;
                          }, 0)
                        )}
                      </span>
                    </div>
                    {existingBid.deliveryCharge !== undefined && existingBid.deliveryCharge > 0 && (
                      <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                        <span>Delivery Charge:</span>
                        <span>${formatCurrency(existingBid.deliveryCharge)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="flex justify-between font-semibold text-lg text-black dark:text-zinc-50">
                        <span>Total:</span>
                        <span>
                          $
                          {formatCurrency(
                            existingBid.total !== undefined
                              ? existingBid.total
                              : (() => {
                                  const lineItemsTotal = (existingBid.lineItems || []).reduce((sum, item) => {
                                    const qty = parseFloat(item.quantity) || 0;
                                    const price = parseFloat(item.unitPrice) || 0;
                                    return sum + qty * price;
                                  }, 0);
                                  const delivery = existingBid.deliveryCharge || 0;
                                  return lineItemsTotal + delivery;
                                })()
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bid Notes */}
                {existingBid.notes && (
                  <div>
                    <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-2">
                      Notes
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                      {existingBid.notes}
                    </p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Bid Form - Only show in create mode */}
          {mode === "create" && showBidForm && (
            <div id="bid-form" className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
              <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-6">
                Submit Bid
              </h2>
              <form onSubmit={handleSubmitBid} className="flex flex-col gap-6">
                {/* Bid Line Items */}
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                    Line Items
                  </h3>
                  <div className="flex flex-col gap-4">
                    {bidLineItems.map((item, index) => (
                      <div
                        key={index}
                        className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg"
                      >
                        <div className="mb-2">
                          <p className="font-medium text-black dark:text-zinc-50">
                            {item.description}
                          </p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Unit: {item.unit}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                              Quantity *
                            </label>
                            <input
                              type="text"
                              value={item.quantity}
                              onChange={(e) =>
                                updateBidLineItem(index, "quantity", e.target.value)
                              }
                              disabled
                              readOnly
                              className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-black dark:text-zinc-50 cursor-not-allowed opacity-75"
                              placeholder="0"
                            />
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                              Quantity from buyer RFQ (locked)
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                              Unit Price *
                            </label>
                            <input
                              type="text"
                              value={formatNumberWithCommas(item.unitPrice)}
                              onChange={(e) => {
                                // Strip commas before saving to state
                                const rawValue = stripCommas(e.target.value);
                                updateBidLineItem(
                                  index,
                                  "unitPrice",
                                  rawValue
                                );
                              }}
                              className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                                bidErrors.lineItems[index]
                                  ? "border-red-500 focus:ring-red-500"
                                  : "border-zinc-300 dark:border-zinc-700 focus:ring-black dark:focus:ring-zinc-50"
                              }`}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        {bidErrors.lineItems[index] && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            {bidErrors.lineItems[index]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delivery Charge (only for DELIVERY) */}
                {rfq.terms.fulfillmentType === "DELIVERY" && (
                  <div>
                    <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                      Delivery Charge (optional)
                    </label>
                    <input
                      type="text"
                      value={deliveryCharge}
                      onChange={(e) => setDeliveryCharge(e.target.value)}
                      className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                      Optional delivery charge will be added to line item total
                    </p>
                  </div>
                )}

                {/* Lead Time */}
                <div>
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    Lead Time (days) <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                      bidErrors.leadTimeDays
                        ? "border-red-500 focus:ring-red-500"
                        : "border-zinc-300 dark:border-zinc-700 focus:ring-black dark:focus:ring-zinc-50"
                    }`}
                    placeholder="e.g., 7"
                  />
                  {bidErrors.leadTimeDays && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {bidErrors.leadTimeDays}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                    Number of days until you can fulfill this order
                  </p>
                </div>

                {/* Total */}
                <div>
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    {rfq.terms.fulfillmentType === "DELIVERY" ? "Grand Total" : "Total"}
                  </label>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                      <span>Line Items Total:</span>
                      <span>
                        $
                        {formatCurrency(
                          bidLineItems.reduce((sum, item) => {
                            const qty = parseFloat(item.quantity) || 0;
                            const price = parseFloat(item.unitPrice) || 0;
                            return sum + qty * price;
                          }, 0)
                        )}
                      </span>
                    </div>
                    {rfq.terms.fulfillmentType === "DELIVERY" && deliveryCharge.trim() && (
                      <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                        <span>Delivery Charge:</span>
                        <span>${formatCurrency(parseFloat(deliveryCharge) || 0)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="flex justify-between font-semibold text-black dark:text-zinc-50">
                        <span>Total:</span>
                        <span>
                          $
                          {formatCurrency(
                            (() => {
                              const lineItemsTotal = bidLineItems.reduce((sum, item) => {
                                const qty = parseFloat(item.quantity) || 0;
                                const price = parseFloat(item.unitPrice) || 0;
                                return sum + qty * price;
                              }, 0);
                              const delivery = rfq.terms.fulfillmentType === "DELIVERY" && deliveryCharge.trim()
                                ? parseFloat(deliveryCharge) || 0
                                : 0;
                              return lineItemsTotal + delivery;
                            })()
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={bidNotes}
                    onChange={(e) => setBidNotes(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                    placeholder="Additional notes about your bid..."
                  />
                </div>

                {/* Submit */}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowBidForm(false)}
                    className="flex-1 flex items-center justify-center h-12 border-2 border-black dark:border-zinc-50 rounded-lg text-black dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-900 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center h-12 bg-black dark:bg-zinc-50 text-white dark:text-black rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 font-medium"
                  >
                    Submit Bid
                  </button>
                </div>
              </form>
            </div>
          )}


          {/* Exception Panel - Resolve/Escalate Actions */}
          {exceptions.filter((ex) => !ex.isResolved).length > 0 && (
            <div className="mb-6 p-4 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3">
                Needs Attention
              </h3>
              <div className="space-y-3">
                {exceptions
                  .filter((ex) => !ex.isResolved)
                  .map((exception) => (
                    <div key={exception.id} className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          {exception.message}
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Severity: {exception.severity}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {(exception.type === "SCHEDULE_OVERDUE" || exception.type === "DELIVERY_OVERDUE") && order && (
                          <button
                            onClick={async () => {
                              if (!currentUser || !order || !rfq) return;
                              
                              try {
                                const threadId = generateThreadId(id, rfq.buyerId || "", currentUser.id);
                                const statusText = exception.type === "SCHEDULE_OVERDUE" ? "schedule" : "delivery";
                                createSystemMessage(
                                  threadId,
                                  `Update requested: Buyer is requesting an update on the ${statusText} status for this order.`,
                                  {
                                    eventType: "UPDATE_REQUEST",
                                    orderId: order.id,
                                    requestId: id,
                                    statusType: statusText,
                                  }
                                );
                                showToast({
                                  type: "success",
                                  message: "Update request sent to buyer",
                                });
                                // Reload exceptions
                                try {
                                  const currentOrder = getOrderByRequestId(id, currentUser.id);
                                  if (currentOrder) {
                                    const request = await getRequest(id, undefined, currentUser?.id);
                                    const now = new Date().toISOString();
                                    const detectedExceptions = detectExceptionsForOrder({
                                      order: currentOrder,
                                      request,
                                      now,
                                    });
                                    setExceptions(detectedExceptions);
                                  }
                                } catch {
                                  // Silently fail
                                }
                              } catch {
                                showToast({
                                  type: "error",
                                  message: "Failed to send update request",
                                });
                                console.error("Error sending update request");
                              }
                            }}
                            className="px-4 py-2 text-sm bg-amber-600 dark:bg-amber-500 text-white rounded-lg hover:bg-amber-700 dark:hover:bg-amber-600 font-medium"
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


        </div>
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

