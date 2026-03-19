"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
// Removed storage imports - using API calls instead
import Header from "@/components/Header";

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
  sellerId?: string;
  lineItems: BidLineItem[];
  notes: string;
  status?: "SUBMITTED" | "WON" | "LOST";
  seenByBuyerAt?: string | null;
  seenBySellerAt?: string | null;
  deliveryCharge?: number;
  total?: number;
}

export default function BuyerBidDetailPage() {
  const params = useParams();
  const bidId = params.bidId as string;
  const [bid, setBid] = useState<Bid | null>(null);
  const [rfq, setRfq] = useState<RFQ | null>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Load bid from API
        // Note: We need to find which RFQ this bid belongs to first
        // For now, we'll try to load bids for all RFQs and find the matching one
        const rfqsRes = await fetch("/api/buyer/rfqs", {
          credentials: "include",
        });
        
        if (!rfqsRes.ok) {
          setLoading(false);
          return;
        }

        const rfqsData = await rfqsRes.json();
        const rfqs = Array.isArray(rfqsData) ? rfqsData : (rfqsData.data || []);
        
        // Find bid by searching through RFQs
        for (const rfq of rfqs) {
          try {
            const bidsRes = await fetch(`/api/buyer/rfqs/${rfq.id}/bids`, {
              credentials: "include",
            });
            
            if (bidsRes.ok) {
              const bidsData = await bidsRes.json();
              const bids = Array.isArray(bidsData) ? bidsData : (bidsData.data || []);
              const foundBid = bids.find((b: Bid) => b.id === bidId);
              
              if (foundBid) {
                setBid(foundBid);
                setRfq(rfq);
                setLoading(false);
                return;
              }
            }
          } catch (error) {
            // Continue searching
          }
        }
        
        // Bid not found
        setBid(null);
        setRfq(null);
      } catch (error) {
        console.error("Error loading bid:", error);
        setBid(null);
        setRfq(null);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [bidId, user]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-zinc-600">Loading...</p>
        </main>
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
        <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
          <div className="w-full">
            <div className="mt-8 text-center">
              <p className="text-zinc-600">Bid not found.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      {/* Main content */}
      <main className="flex flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="w-full">
          <div className="mb-6">
            <Link
              href="/buyer/dashboard"
              className="text-sm text-zinc-600 hover:text-black"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-semibold text-black mt-4">
              Quote for Request #{rfq?.rfqNumber || "Unknown"}
            </h1>
            <p className="text-sm text-zinc-600 mt-1">
              Buyer Company
            </p>
          </div>

          {/* Bid Details */}
          <div className="flex flex-col gap-6">
            {/* Seller Info */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-semibold text-black">
                  {bid.sellerName}
                </h2>
                {bid.status && (
                  <span className="text-sm px-3 py-1 rounded bg-zinc-100 text-zinc-700">
                    {bid.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-600">
                Submitted {formatDate(bid.createdAt)}
              </p>
            </div>

            {/* Line Items */}
            <div>
              <h2 className="text-xl font-semibold text-black mb-4">
                Line Items
              </h2>
              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">
                        Unit Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {bid.lineItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-black">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-black">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-black">
                          ${parseFloat(item.unitPrice || "0").toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bid Notes */}
            {bid.notes && (
              <div>
                <h2 className="text-xl font-semibold text-black mb-2">
                  Notes
                </h2>
                <p className="text-zinc-600 whitespace-pre-wrap">
                  {bid.notes}
                </p>
              </div>
            )}

            {/* Bid Totals */}
            <div>
              <h2 className="text-xl font-semibold text-black mb-4">
                Bid Total
              </h2>
              <div className="p-4 border border-zinc-200 rounded-lg bg-zinc-50">
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
            </div>

            {/* RFQ Terms (Read-only) */}
            {rfq && (
              <div>
                <h2 className="text-xl font-semibold text-black mb-4">
                  Required Terms
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-zinc-200 rounded-lg bg-zinc-50">
                  <div>
                    <p className="text-sm text-zinc-600 mb-1">
                      Fulfillment Type
                    </p>
                    <p className="text-black">
                      {rfq.terms.fulfillmentType}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-600 mb-1">
                      {rfq.terms.fulfillmentType === "PICKUP" ? "Pickup Date" : "Requested Delivery Date"}
                    </p>
                    <p className="text-black">
                      {formatDateShort(rfq.terms.requestedDate)}
                    </p>
                  </div>
                  {rfq.terms.fulfillmentType === "DELIVERY" && (
                    <>
                      <div>
                        <p className="text-sm text-zinc-600 mb-1">
                          Delivery Preference
                        </p>
                        <p className="text-black">
                          {rfq.terms.deliveryPreference || "ANYTIME"}
                        </p>
                      </div>
                      {rfq.terms.deliveryInstructions && (
                        <div className="md:col-span-2">
                          <p className="text-sm text-zinc-600 mb-1">
                            Special Delivery Instructions
                          </p>
                          <p className="text-black whitespace-pre-wrap">
                            {rfq.terms.deliveryInstructions}
                          </p>
                        </div>
                      )}
                      {rfq.terms.location && (
                        <div className="md:col-span-2">
                          <p className="text-sm text-zinc-600 mb-1">
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
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <Link
                href="/buyer/dashboard"
                className="flex-1 flex items-center justify-center h-12 bg-black text-white rounded-lg hover:bg-zinc-800 font-medium"
              >
                Dashboard
              </Link>
              {bid?.sellerId && rfq?.id ? (
                <Link
                  href={`/buyer/messages/${rfq.id}?sellerId=${bid.sellerId}`}
                  className="flex-1 flex items-center justify-center h-12 border-2 border-black rounded-lg text-black hover:bg-zinc-100 font-medium"
                >
                  View Messages
                </Link>
              ) : (
                <Link
                  href={`/buyer/messages/${rfq?.id || ""}`}
                  className="flex-1 flex items-center justify-center h-12 border-2 border-black rounded-lg text-black hover:bg-zinc-100 font-medium"
                >
                  View Messages
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

