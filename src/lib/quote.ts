/**
 * Canonical Quote View Model
 * Read-only mapping layer for recommendation engine consumption
 */

/**
 * Quote interface - canonical view model for bids/quotes
 */
export interface Quote {
  requestId: string; // RFQ/Request ID
  sellerId: string; // Seller user ID
  priceSubtotal: number; // Sum of line items (before delivery/tax)
  deliveryFee: number; // Delivery charge (0 if pickup or no charge)
  tax: number; // Tax amount (defaults to 0 if not specified)
  totalPrice: number; // Computed: priceSubtotal + deliveryFee + tax
  leadTimeDays?: number; // Days until fulfillment (optional, may not be captured yet)
  promisedDate?: string; // ISO date string for promised delivery (alternative to leadTimeDays)
  fulfillmentMode: "delivery" | "pickup" | "unknown"; // How the order will be fulfilled
  submittedAt: string; // ISO timestamp when quote was submitted
  notes?: string; // Optional notes from seller
}

/**
 * Bid interface (minimal, for mapping)
 */
interface Bid {
  id: string;
  rfqId: string;
  sellerId?: string;
  sellerName?: string;
  createdAt: string;
  lineItems: Array<{
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
  }>;
  deliveryCharge?: number;
  total?: number;
  notes?: string;
  leadTimeDays?: number; // May be added in future
  promisedDate?: string; // May be added in future
}

/**
 * RFQ interface (minimal, for fulfillment mode mapping)
 */
interface RFQ {
  id: string;
  terms?: {
    fulfillmentType?: "PICKUP" | "DELIVERY";
  };
}

/**
 * Map a Bid to a canonical Quote view model
 * 
 * @param bid Bid object from storage
 * @param rfq Optional RFQ object to determine fulfillmentMode (if not provided, defaults to "unknown")
 * @returns Quote object ready for recommendation engine
 */
export function mapBidToQuote(bid: Bid, rfq?: RFQ): Quote {
  // Extract requestId
  const requestId = bid.rfqId;

  // Extract sellerId (required, throw if missing)
  if (!bid.sellerId) {
    throw new Error(`mapBidToQuote: bid ${bid.id} is missing sellerId`);
  }
  const sellerId = bid.sellerId;

  // Compute priceSubtotal from line items
  const priceSubtotal = bid.lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity || "0");
    const price = parseFloat(item.unitPrice || "0");
    return sum + qty * price;
  }, 0);

  // Extract deliveryFee (default to 0)
  const deliveryFee = bid.deliveryCharge ?? 0;

  // Extract tax (not currently captured in Bid, default to 0)
  // In future, if tax is added to Bid, use: bid.tax ?? 0
  const tax = 0;

  // Compute totalPrice safely
  // Prefer bid.total if present and valid, otherwise compute
  let totalPrice: number;
  if (bid.total !== undefined && bid.total !== null && !isNaN(bid.total)) {
    totalPrice = bid.total;
  } else {
    // Compute: subtotal + delivery + tax
    totalPrice = priceSubtotal + deliveryFee + tax;
  }

  // Extract leadTimeDays or promisedDate (optional, may not exist yet)
  const leadTimeDays = bid.leadTimeDays;
  const promisedDate = bid.promisedDate;

  // Determine fulfillmentMode from RFQ
  let fulfillmentMode: "delivery" | "pickup" | "unknown" = "unknown";
  if (rfq?.terms?.fulfillmentType) {
    const fulfillmentType = rfq.terms.fulfillmentType.toLowerCase();
    if (fulfillmentType === "delivery") {
      fulfillmentMode = "delivery";
    } else if (fulfillmentType === "pickup") {
      fulfillmentMode = "pickup";
    }
  }

  // Extract submittedAt (use createdAt)
  const submittedAt = bid.createdAt;

  // Extract notes (optional)
  const notes = bid.notes;

  return {
    requestId,
    sellerId,
    priceSubtotal,
    deliveryFee,
    tax,
    totalPrice,
    ...(leadTimeDays !== undefined && { leadTimeDays }),
    ...(promisedDate !== undefined && { promisedDate }),
    fulfillmentMode,
    submittedAt,
    ...(notes !== undefined && notes !== null && notes.trim().length > 0 && { notes }),
  };
}

/**
 * Map multiple bids to quotes
 * 
 * @param bids Array of Bid objects
 * @param rfq Optional RFQ object (used for all bids if provided)
 * @returns Array of Quote objects
 */
export function mapBidsToQuotes(bids: Bid[], rfq?: RFQ): Quote[] {
  return bids
    .filter((bid) => bid.sellerId) // Filter out bids without sellerId
    .map((bid) => {
      try {
        return mapBidToQuote(bid, rfq);
      } catch (error) {
        // Log error but don't throw - skip invalid bids
        if (process.env.NODE_ENV === "development") {
          console.error(`mapBidsToQuotes: Skipping invalid bid ${bid.id}:`, error);
        }
        return null;
      }
    })
    .filter((quote): quote is Quote => quote !== null); // Remove nulls
}

