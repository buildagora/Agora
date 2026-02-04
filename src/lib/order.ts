/**
 * Order model and storage helpers
 * Layer 5: Order record for tracking award -> confirmation -> fulfillment
 */

import { RFQRequest } from "./request";
import { Quote } from "./quote";
import { logEvent } from "./eventLog";

/**
 * Order status lifecycle
 */
export type OrderStatus = 
  | "awarded"      // Buyer awarded the quote (initial state)
  | "confirmed"    // Seller confirmed acceptance
  | "scheduled"    // Delivery scheduled (DELIVERY only)
  | "delivered"    // Order delivered (DELIVERY only)
  | "picked_up"    // Order picked up (PICKUP only)
  | "cancelled";   // Order cancelled

/**
 * Status history event
 */
export interface OrderStatusEvent {
  status: OrderStatus;
  at: string; // ISO timestamp
  byUserId: string; // User ID who triggered the status change
  note?: string; // Optional note/comment
}

/**
 * Delivery details snapshot (from request at time of award)
 */
export interface OrderDeliveryDetails {
  mode: "delivery" | "pickup" | "unknown";
  address?: string; // For delivery mode
  pickupWindow?: string; // For pickup mode
  needBy?: string; // ISO date string
  deliveryPreference?: string; // e.g., "MORNING", "ANYTIME"
  deliveryInstructions?: string;
}

/**
 * Order item snapshot (from request at time of award)
 */
export interface OrderItem {
  id: string;
  description: string;
  category?: string;
  quantity: number;
  unit: string;
  sku?: string;
  brand?: string;
  specs?: string | Record<string, any>;
}

/**
 * Order interface
 */
export interface Order {
  id: string; // UUID
  requestId: string; // Request/RFQ ID
  buyerId: string;
  sellerId: string;
  awardedQuoteId: string; // Quote/Bid ID that was awarded
  totalPrice: number; // Total price from quote
  fulfillmentMode: "delivery" | "pickup" | "unknown";
  deliveryDetails: OrderDeliveryDetails;
  items: OrderItem[]; // Snapshot of request items at award time
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * Input for creating an order from an award
 */
export interface CreateOrderFromAwardInput {
  request: RFQRequest;
  quote: Quote;
  buyerId: string;
  bidId?: string; // Optional bid ID (if available from award context)
}

/**
 * Check if an order already exists for a request
 * 
 * @param requestId Request ID
 * @param buyerId Buyer ID
 * @returns Existing order if found, null otherwise
 */
function getExistingOrderForRequest(requestId: string, buyerId: string): Order | null {
  const buyerOrders = readUserJson<Order[]>(buyerId, "orders", []);
  return buyerOrders.find((o) => o.requestId === requestId) || null;
}

/**
 * Validate order status transition
 * 
 * @param currentStatus Current order status
 * @param newStatus New status being requested
 * @returns true if transition is valid, throws error if invalid
 */
function validateStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
  // Same status is always valid (idempotent)
  if (currentStatus === newStatus) {
    return;
  }

  // Valid forward transitions
  // Note: scheduled/delivered are for DELIVERY, picked_up is for PICKUP
  // The UI should enforce this based on fulfillmentMode, but we allow both paths here
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    awarded: ["confirmed", "cancelled"],
    confirmed: ["scheduled", "picked_up", "cancelled"], // Can go to scheduled (DELIVERY) or picked_up (PICKUP)
    scheduled: ["delivered", "cancelled"], // DELIVERY flow only
    delivered: [], // No transitions from delivered (DELIVERY complete)
    picked_up: [], // No transitions from picked_up (PICKUP complete)
    cancelled: [], // No transitions from cancelled
  };

  const allowedNextStatuses = validTransitions[currentStatus];
  if (!allowedNextStatuses || !allowedNextStatuses.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: Cannot change order status from "${currentStatus}" to "${newStatus}". ` +
      `Allowed transitions from "${currentStatus}": ${allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none"}`
    );
  }
}

/**
 * Create an order from an award
 * 
 * @param input Request, quote, and buyer ID
 * @returns The created order
 * @throws Error if an order already exists for this request (unless it's cancelled)
 */
export function createOrderFromAward(input: CreateOrderFromAwardInput): Order {
  const { request, quote, buyerId, bidId } = input;
  
  if (!request || !quote || !buyerId) {
    throw new Error("createOrderFromAward: request, quote, and buyerId are required");
  }
  
  if (!quote.sellerId) {
    throw new Error("createOrderFromAward: quote must have sellerId");
  }

  // Invariant: Only one order per requestId (unless existing order is cancelled)
  const existingOrder = getExistingOrderForRequest(request.id, buyerId);
  if (existingOrder) {
    if (existingOrder.status !== "cancelled") {
      throw new Error(
        `Cannot create order: An order already exists for request ${request.id} with status "${existingOrder.status}". ` +
        `Only one active order is allowed per request. Cancel the existing order first if you need to create a new one.`
      );
    }
    // If existing order is cancelled, we can create a new one (re-award scenario)
  }
  
  // Use bidId if provided, otherwise fall back to sellerId as identifier
  const awardedQuoteId = bidId || quote.sellerId;
  
  const now = new Date().toISOString();
  
  // Build delivery details snapshot from request
  const deliveryDetails: OrderDeliveryDetails = {
    mode: request.delivery.mode === "delivery" ? "delivery" : 
          request.delivery.mode === "pickup" ? "pickup" : "unknown",
    needBy: request.delivery.needBy,
    ...(request.delivery.mode === "delivery" && {
      address: request.delivery.address,
    }),
    ...(request.delivery.mode === "pickup" && {
      pickupWindow: request.delivery.pickupWindow,
    }),
  };
  
  // Build items snapshot from request
  const items: OrderItem[] = request.items.map((item) => ({
    id: item.id,
    description: item.description,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    ...(item.sku && { sku: item.sku }),
    ...(item.brand && { brand: item.brand }),
    ...(item.specs && { specs: item.specs }),
  }));
  
  // Determine fulfillment mode from quote or request
  const fulfillmentMode: "delivery" | "pickup" | "unknown" = 
    quote.fulfillmentMode === "delivery" ? "delivery" :
    quote.fulfillmentMode === "pickup" ? "pickup" :
    request.delivery.mode === "delivery" ? "delivery" :
    request.delivery.mode === "pickup" ? "pickup" :
    "unknown";
  
  // Create initial status event
  const initialStatusEvent: OrderStatusEvent = {
    status: "awarded",
    at: now,
    byUserId: buyerId,
    note: "Order created from award",
  };
  
  // Create order
  const order: Order = {
    id: crypto.randomUUID(),
    requestId: request.id,
    buyerId,
    sellerId: quote.sellerId,
    awardedQuoteId, // Use bidId if provided, otherwise sellerId
    totalPrice: quote.totalPrice ?? 0,
    fulfillmentMode,
    deliveryDetails,
    items,
    status: "awarded",
    statusHistory: [initialStatusEvent],
    createdAt: now,
    updatedAt: now,
  };
  
  // Save to buyer's scoped storage
  const buyerOrders = readUserJson<Order[]>(buyerId, "orders", []);
  const updatedBuyerOrders = [...buyerOrders, order];
  writeUserJson(buyerId, "orders", updatedBuyerOrders);
  
  // Save to seller's scoped storage
  const sellerOrders = readUserJson<Order[]>(quote.sellerId, "orders", []);
  const updatedSellerOrders = [...sellerOrders, order];
  writeUserJson(quote.sellerId, "orders", updatedSellerOrders);
  
  // Log event: ORDER_AWARDED
  try {
    logEvent({
      type: "ORDER_AWARDED",
      requestId: request.id,
      orderId: order.id,
      buyerId,
      sellerId: quote.sellerId,
      metadata: {
        totalPrice: order.totalPrice,
        fulfillmentMode: order.fulfillmentMode,
      },
    });
  } catch (error) {
    // Silently fail - event logging should not break order creation
    if (process.env.NODE_ENV === "development") {
      console.error("Error logging ORDER_AWARDED event:", error);
    }
  }
  
  return order;
}

/**
 * Get an order by ID
 * 
 * @param orderId Order ID
 * @param userId User ID (buyer or seller) to search in their scoped storage
 * @returns The order if found, null otherwise
 */
export function getOrder(orderId: string, userId: string): Order | null {
  if (!orderId || !userId) {
    return null;
  }
  
  const orders = readUserJson<Order[]>(userId, "orders", []);
  return orders.find((o) => o.id === orderId) || null;
}

/**
 * Get an order by request ID
 * 
 * @param requestId Request/RFQ ID
 * @param userId User ID (buyer or seller) to search in their scoped storage
 * @returns The order if found, null otherwise
 */
export function getOrderByRequestId(requestId: string, userId: string): Order | null {
  if (!requestId || !userId) {
    return null;
  }
  
  const orders = readUserJson<Order[]>(userId, "orders", []);
  return orders.find((o) => o.requestId === requestId) || null;
}

/**
 * Update order status
 * 
 * @param orderId Order ID
 * @param status New status
 * @param byUserId User ID who is making the change
 * @param note Optional note/comment
 * @returns The updated order, or null if not found
 * @throws Error if status transition is invalid
 */
export function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  byUserId: string,
  note?: string
): Order | null {
  if (!orderId || !status || !byUserId) {
    return null;
  }
  
  // Try to find order in buyer's storage first
  let buyerOrders = readUserJson<Order[]>(byUserId, "orders", []);
  let orderIndex = buyerOrders.findIndex((o) => o.id === orderId);
  let foundInBuyer = orderIndex >= 0;
  let order: Order | null = null;
  
  // If not found, try seller's storage
  if (!foundInBuyer) {
    const sellerOrders = readUserJson<Order[]>(byUserId, "orders", []);
    const sellerOrderIndex = sellerOrders.findIndex((o) => o.id === orderId);
    if (sellerOrderIndex >= 0) {
      order = sellerOrders[sellerOrderIndex];
    } else {
      return null;
    }
  } else {
    order = buyerOrders[orderIndex];
  }

  if (!order) {
    return null;
  }

  // Invariant: Validate status transition
  validateStatusTransition(order.status, status);
  
  const now = new Date().toISOString();
  
  const statusEvent: OrderStatusEvent = {
    status,
    at: now,
    byUserId,
    ...(note && { note }),
  };
  
  const updatedOrder: Order = {
    ...order,
    status,
    statusHistory: [...order.statusHistory, statusEvent],
    updatedAt: now,
  };
  
  // Update in the storage where we found it
  if (foundInBuyer) {
    buyerOrders[orderIndex] = updatedOrder;
    writeUserJson(byUserId, "orders", buyerOrders);
    
    // Also update in seller's storage
    if (order.sellerId !== byUserId) {
      const sellerOrders = readUserJson<Order[]>(order.sellerId, "orders", []);
      const sellerOrderIndex = sellerOrders.findIndex((o) => o.id === orderId);
      if (sellerOrderIndex >= 0) {
        sellerOrders[sellerOrderIndex] = updatedOrder;
        writeUserJson(order.sellerId, "orders", sellerOrders);
      }
    }
  } else {
    // Found in seller storage
    const sellerOrders = readUserJson<Order[]>(byUserId, "orders", []);
    const sellerOrderIndex = sellerOrders.findIndex((o) => o.id === orderId);
    if (sellerOrderIndex >= 0) {
      sellerOrders[sellerOrderIndex] = updatedOrder;
      writeUserJson(byUserId, "orders", sellerOrders);
    }
    
    // Also update in buyer's storage
    if (order.buyerId !== byUserId) {
      const buyerOrdersForUpdate = readUserJson<Order[]>(order.buyerId, "orders", []);
      const buyerOrderIndex = buyerOrdersForUpdate.findIndex((o) => o.id === orderId);
      if (buyerOrderIndex >= 0) {
        buyerOrdersForUpdate[buyerOrderIndex] = updatedOrder;
        writeUserJson(order.buyerId, "orders", buyerOrdersForUpdate);
      }
    }
  }
  
  // Log event: Order status change
  try {
    const eventTypeMap: Record<OrderStatus, "ORDER_CONFIRMED" | "ORDER_SCHEDULED" | "ORDER_DELIVERED" | "ORDER_PICKED_UP" | "ORDER_CANCELLED" | null> = {
      awarded: null, // Already logged in createOrderFromAward
      confirmed: "ORDER_CONFIRMED",
      scheduled: "ORDER_SCHEDULED",
      delivered: "ORDER_DELIVERED",
      picked_up: "ORDER_PICKED_UP",
      cancelled: "ORDER_CANCELLED",
    };
    
    const eventType = eventTypeMap[status];
    if (eventType) {
      logEvent({
        type: eventType,
        requestId: order.requestId,
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        metadata: {
          previousStatus: order.status,
          note: note || undefined,
        },
      });
    }
  } catch (error) {
    // Silently fail - event logging should not break status update
    if (process.env.NODE_ENV === "development") {
      console.error("Error logging order status event:", error);
    }
  }
  
  return updatedOrder;
}

