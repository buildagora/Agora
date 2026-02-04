"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { downloadPoPdf, PO } from "@/lib/poPdf";
// Removed storage imports - using API calls instead
import { useToast, ToastContainer } from "./Toast";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Button from "@/components/ui2/Button";
import { type RFQ } from "@/lib/rfqs";

interface PurchaseOrderActionsProps {
  rfqId: string;
  role: "BUYER" | "SELLER";
  rfq?: RFQ | null; // Optional RFQ prop (if already loaded)
  order?: null; // Order prop removed - order status is now handled at page level
}

/**
 * Shared component for Purchase Order actions (Download PDF + Email PO)
 * Only shows for won/awarded RFQs
 * Creates PO lazily if missing for legacy won jobs
 */
export default function PurchaseOrderActions({ rfqId, role, rfq: rfqProp }: PurchaseOrderActionsProps) {
  const { user: currentUser } = useAuth();
  const [po, setPo] = useState<PO | null>(null);
  const [rfq, setRfq] = useState<RFQ | null>(rfqProp || null);
  const [loading, setLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const { showToast, toasts, removeToast } = useToast();

  useEffect(() => {
    loadData();
  }, [rfqId, role, rfqProp, currentUser]);

  const loadData = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    // Use provided RFQ prop or load it from API
    let foundRFQ: RFQ | null = rfqProp || null;
    if (!foundRFQ) {
      try {
        const endpoint = role === "BUYER" 
          ? `/api/buyer/rfqs/${rfqId}`
          : `/api/seller/rfqs/${rfqId}`;
        const res = await fetch(endpoint, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          foundRFQ = data.data || data;
        }
      } catch (error) {
        console.error("Error loading RFQ:", error);
      }
    }

    if (!foundRFQ) {
      setLoading(false);
      return;
    }

    setRfq(foundRFQ);

    // Check if RFQ is won/awarded
    const isWon = foundRFQ.status === "AWARDED" || foundRFQ.status === "CLOSED";
    if (!isWon || !foundRFQ.awardedBidId) {
      setLoading(false);
      return; // Don't show PO actions for non-awarded RFQs
    }

    // Load PO from API
    try {
      const res = await fetch(`/api/buyer/orders?rfqId=${rfqId}`, {
        credentials: "include",
      });
      
      let foundPO: PO | null = null;
      if (res.ok) {
        const data = await res.json();
        const orders = Array.isArray(data) ? data : (data.data || []);
        const order = orders.find((o: any) => o.rfqId === rfqId);
        if (order) {
          // Handle lineItems - API already parses it, but handle both string and object cases
          let lineItems: any[] = [];
          if (typeof order.lineItems === "string") {
            try {
              lineItems = JSON.parse(order.lineItems);
            } catch {
              lineItems = [];
            }
          } else if (Array.isArray(order.lineItems)) {
            lineItems = order.lineItems;
          }
          
          // Convert order to PO format
          foundPO = {
            id: order.id,
            poNumber: order.orderNumber,
            rfqId: order.rfqId,
            winningBidId: order.awardedBidId || foundRFQ.awardedBidId,
            buyerName: currentUser.companyName || "Buyer",
            sellerName: order.sellerName || "Seller",
            issuedAt: order.createdAt,
            lineItems,
            subtotal: order.subtotal || (order.total ? order.total - (order.total * 0.08 / 1.08) : 0),
            taxes: order.taxes || (order.total ? order.total * 0.08 / 1.08 : 0),
            total: order.total || 0,
            fulfillmentType: order.fulfillmentType || foundRFQ.terms.fulfillmentType,
            requestedDate: order.requestedDate || foundRFQ.terms.requestedDate,
            deliveryPreference: order.deliveryPreference || foundRFQ.terms.deliveryPreference,
            deliveryInstructions: order.deliveryInstructions || foundRFQ.terms.deliveryInstructions,
            location: order.location || foundRFQ.terms.location,
            notes: order.notes || undefined,
          };
        }
      }
      
      // If PO doesn't exist, it will be created server-side when order is awarded
      // For now, we'll just show null if PO doesn't exist
      setPo(foundPO);
    } catch (error) {
      console.error("Error loading PO:", error);
      setPo(null);
    } finally {
      setLoading(false);
    }
  };

  // getWinningBid removed - bid data comes from order/PO API response

  // PO creation is now handled server-side when order is awarded
  // This function is no longer needed

  const handleEmailPO = async () => {
    if (!po || !rfq) return;

    if (!currentUser?.email) {
      showToast({
        type: "error",
        message: "Unable to send email",
        subtitle: "User email not found",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      // Call the new API endpoint
      const response = await fetch(`/api/purchase-orders/${po.id}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: currentUser.id,
          po: po,
          userEmail: currentUser.email,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        showToast({
          type: "success",
          message: "Purchase Order emailed",
          subtitle: `Sent to ${result.to}`,
        });

        if (process.env.NODE_ENV === "development" && result.messageId) {
          console.log("✅ EMAIL_SENT", {
            messageId: result.messageId,
            to: result.to,
          });
        }
      } else {
        // Handle different error types with friendly messages
        let errorMessage = "Failed to send email";
        if (result.error === "EMAIL_NOT_CONFIGURED") {
          errorMessage = "Email not configured. Add RESEND_API_KEY + EMAIL_FROM and restart dev server.";
        } else if (result.error === "RESEND_NOT_INSTALLED") {
          errorMessage = "Email service is not available. Please contact support.";
        } else if (result.error === "PDF_GENERATION_FAILED") {
          errorMessage = "Failed to generate PDF. Please try again.";
        } else if (result.error === "USER_EMAIL_MISSING") {
          errorMessage = "User email is required to send the purchase order.";
        } else if (result.message) {
          errorMessage = result.message;
        } else if (result.error) {
          errorMessage = result.error;
        }

        showToast({
          type: "error",
          message: "Email failed to send",
          subtitle: errorMessage,
        });
      }
    } catch (error: any) {
      console.error("❌ EMAIL_PO_FETCH_ERROR", {
        error: error.message,
      });

      showToast({
        type: "error",
        message: "Email failed to send",
        subtitle: error.message || "An unexpected error occurred",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Don't render anything if loading, RFQ not found, or not won/awarded
  if (loading || !rfq || !po) {
    return null;
  }

  // Only show for won/awarded RFQs
  const isWon = rfq.status === "AWARDED" || rfq.status === "CLOSED";
  if (!isWon || !rfq.awardedBidId) {
    return null;
  }

  // Get buyer and seller names for display
  const buyerName = po.buyerName || "Buyer";
  const sellerName = po.sellerName || "Seller";

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">Purchase Order</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* PO Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">PO Number</p>
                <p className="font-semibold text-black dark:text-zinc-50">{po.poNumber}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total</p>
                <p className="font-semibold text-black dark:text-zinc-50">${po.total.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  {role === "BUYER" ? "Awarded Seller" : "Buyer"}
                </p>
                <p className="font-medium text-black dark:text-zinc-50">
                  {role === "BUYER" ? sellerName : buyerName}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Status</p>
                <p className="font-medium text-black dark:text-zinc-50">Ready</p>
              </div>
            </div>

            {/* PO Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                variant="primary"
                size="md"
                onClick={() => downloadPoPdf(po)}
                className="flex-1"
              >
                Download PDF
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={handleEmailPO}
                disabled={isSendingEmail}
                className="flex-1"
              >
                {isSendingEmail ? "Sending..." : "Email me PDF"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

