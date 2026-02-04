/**
 * Supplier Metrics (Layer 7: Analytics)
 * Computed metrics from Event Log for supplier performance
 */

import { listEventsBySeller, type EventLogEntry, type EventType } from "./eventLog";
import { SLA_CONFIRM_HOURS, SLA_DELIVERED_HOURS } from "./slaConfig";
import { getOrder } from "./order";

/**
 * Supplier metrics computed from event log
 */
export interface SupplierMetrics {
  responseRate: number | "N/A"; // responded/dispatches (0-1 or "N/A")
  medianResponseTimeMinutes: number | "N/A"; // median time from dispatch to response
  winRate: number | "N/A"; // awarded/quotes_submitted (0-1 or "N/A")
  onTimeConfirmRate: number | "N/A"; // confirmed within SLA_CONFIRM_HOURS (0-1 or "N/A")
  onTimeDeliveryRate: number | "N/A"; // delivered by needBy or within SLA_DELIVERED_HOURS (0-1 or "N/A")
}

/**
 * Supplier signals (small tags for recommendation engine)
 */
export interface SupplierSignals {
  isHighResponder: boolean; // responseRate > 0.8
  isFastResponder: boolean; // medianResponseTimeMinutes < 60
  isHighWinRate: boolean; // winRate > 0.3
  isReliable: boolean; // onTimeConfirmRate > 0.9 && onTimeDeliveryRate > 0.9
}

/**
 * Get supplier metrics for a given seller
 * 
 * @param sellerId Seller ID
 * @param windowDays Number of days to look back (default: 30)
 * @returns Computed metrics
 */
export function getSupplierMetrics(sellerId: string, windowDays: number = 30): SupplierMetrics {
  if (!sellerId) {
    return {
      responseRate: "N/A",
      medianResponseTimeMinutes: "N/A",
      winRate: "N/A",
      onTimeConfirmRate: "N/A",
      onTimeDeliveryRate: "N/A",
    };
  }

  // Get events within time window
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const events = listEventsBySeller(sellerId, windowStart.toISOString());

  if (events.length === 0) {
    return {
      responseRate: "N/A",
      medianResponseTimeMinutes: "N/A",
      winRate: "N/A",
      onTimeConfirmRate: "N/A",
      onTimeDeliveryRate: "N/A",
    };
  }

  // Compute responseRate: responded/dispatches
  const dispatches = events.filter((e) => e.type === "DISPATCH_SENT");
  const responses = events.filter((e) => e.type === "SUPPLIER_RESPONDED");
  
  // Group by requestId to match dispatches with responses
  const dispatchByRequest = new Map<string, EventLogEntry>();
  dispatches.forEach((e) => {
    if (e.requestId && !dispatchByRequest.has(e.requestId)) {
      dispatchByRequest.set(e.requestId, e);
    }
  });

  const responseByRequest = new Map<string, EventLogEntry>();
  responses.forEach((e) => {
    if (e.requestId && !responseByRequest.has(e.requestId)) {
      responseByRequest.set(e.requestId, e);
    }
  });

  const responseRate = dispatchByRequest.size > 0
    ? responseByRequest.size / dispatchByRequest.size
    : "N/A";

  // Compute medianResponseTimeMinutes: time from DISPATCH_SENT to SUPPLIER_RESPONDED
  const responseTimes: number[] = [];
  dispatchByRequest.forEach((dispatch, requestId) => {
    const response = responseByRequest.get(requestId);
    if (response) {
      const dispatchTime = new Date(dispatch.at).getTime();
      const responseTime = new Date(response.at).getTime();
      const minutes = (responseTime - dispatchTime) / (1000 * 60);
      if (minutes >= 0) {
        responseTimes.push(minutes);
      }
    }
  });

  const medianResponseTimeMinutes = responseTimes.length > 0
    ? computeMedian(responseTimes)
    : "N/A";

  // Compute winRate: ORDER_AWARDED / BID_SUBMITTED
  const bidsSubmitted = events.filter((e) => e.type === "BID_SUBMITTED");
  const ordersAwarded = events.filter((e) => e.type === "ORDER_AWARDED" && e.sellerId === sellerId);

  const winRate = bidsSubmitted.length > 0
    ? ordersAwarded.length / bidsSubmitted.length
    : "N/A";

  // Compute onTimeConfirmRate: ORDER_CONFIRMED within SLA_CONFIRM_HOURS of ORDER_AWARDED
  const confirmTimes: number[] = [];
  ordersAwarded.forEach((awarded) => {
    if (!awarded.orderId) return;
    
    // Find corresponding ORDER_CONFIRMED event
    const confirmed = events.find(
      (e) => e.type === "ORDER_CONFIRMED" && e.orderId === awarded.orderId
    );
    
    if (confirmed) {
      const awardedTime = new Date(awarded.at).getTime();
      const confirmedTime = new Date(confirmed.at).getTime();
      const hours = (confirmedTime - awardedTime) / (1000 * 60 * 60);
      confirmTimes.push(hours);
    }
  });

  const onTimeConfirmRate = confirmTimes.length > 0
    ? confirmTimes.filter((hours) => hours <= SLA_CONFIRM_HOURS).length / confirmTimes.length
    : "N/A";

  // Compute onTimeDeliveryRate: ORDER_DELIVERED by needBy or within SLA_DELIVERED_HOURS
  const onTimeDeliveries: boolean[] = [];
  
  ordersAwarded.forEach((awarded) => {
    if (!awarded.orderId) return;
    
    // Find corresponding ORDER_DELIVERED event
    const delivered = events.find(
      (e) => e.type === "ORDER_DELIVERED" && e.orderId === awarded.orderId
    );
    
    if (delivered) {
      const deliveredAt = new Date(delivered.at);
      const awardedAt = new Date(awarded.at);
      
      // Try to get needBy from order record
      let needBy: Date | undefined;
      try {
        const order = getOrder(awarded.orderId, sellerId);
        if (order?.deliveryDetails?.needBy) {
          needBy = new Date(order.deliveryDetails.needBy);
        }
      } catch {
        // Silently continue if order not found
      }

      let isOnTime: boolean;
      if (needBy) {
        // Check if delivered by needBy
        isOnTime = deliveredAt <= needBy;
      } else {
        // If no needBy, check if delivered within SLA_DELIVERED_HOURS of ORDER_AWARDED
        const hours = (deliveredAt.getTime() - awardedAt.getTime()) / (1000 * 60 * 60);
        isOnTime = hours <= SLA_DELIVERED_HOURS;
      }

      onTimeDeliveries.push(isOnTime);
    }
  });

  const onTimeDeliveryRate = onTimeDeliveries.length > 0
    ? onTimeDeliveries.filter((isOnTime) => isOnTime).length / onTimeDeliveries.length
    : "N/A";

  return {
    responseRate,
    medianResponseTimeMinutes,
    winRate,
    onTimeConfirmRate,
    onTimeDeliveryRate,
  };
}

/**
 * Get supplier signals for a request (small tags for recommendation engine)
 * 
 * @param buyerId Buyer ID
 * @param sellerId Seller ID
 * @param requestCategory Optional request category for filtering
 * @returns Supplier signals
 */
export function getSupplierSignalsForRequest(
  buyerId: string,
  sellerId: string,
  requestCategory?: string
): SupplierSignals {
  if (!sellerId) {
    return {
      isHighResponder: false,
      isFastResponder: false,
      isHighWinRate: false,
      isReliable: false,
    };
  }

  const metrics = getSupplierMetrics(sellerId, 30);

  return {
    isHighResponder: typeof metrics.responseRate === "number" && metrics.responseRate > 0.8,
    isFastResponder: typeof metrics.medianResponseTimeMinutes === "number" && metrics.medianResponseTimeMinutes < 60,
    isHighWinRate: typeof metrics.winRate === "number" && metrics.winRate > 0.3,
    isReliable: 
      typeof metrics.onTimeConfirmRate === "number" && metrics.onTimeConfirmRate > 0.9 &&
      typeof metrics.onTimeDeliveryRate === "number" && metrics.onTimeDeliveryRate > 0.9,
  };
}

/**
 * Get reliability tags for a supplier (for UI display)
 * Returns up to 2 tags: positive tags first, then warning tags
 * 
 * @param buyerId Buyer ID
 * @param sellerId Seller ID
 * @param requestCategory Optional request category
 * @returns Array of tag objects with label and type
 */
export function getSupplierReliabilityTags(
  buyerId: string,
  sellerId: string,
  requestCategory?: string
): Array<{ label: string; type: "positive" | "warning" }> {
  if (!sellerId) {
    return [];
  }

  const metrics = getSupplierMetrics(sellerId, 30);
  const tags: Array<{ label: string; type: "positive" | "warning" }> = [];

  // Positive tags
  if (typeof metrics.medianResponseTimeMinutes === "number" && metrics.medianResponseTimeMinutes < 60) {
    tags.push({ label: "Fast responder", type: "positive" });
  }

  if (typeof metrics.winRate === "number" && metrics.winRate > 0.3) {
    tags.push({ label: "High win rate", type: "positive" });
  }

  if (typeof metrics.onTimeDeliveryRate === "number" && metrics.onTimeDeliveryRate > 0.9) {
    tags.push({ label: "On-time delivery", type: "positive" });
  }

  // Warning tags
  if (typeof metrics.onTimeConfirmRate === "number" && metrics.onTimeConfirmRate < 0.7) {
    tags.push({ label: "Late confirmations", type: "warning" });
  }

  // Return up to 2 tags (prioritize positive tags)
  const positiveTags = tags.filter((t) => t.type === "positive");
  const warningTags = tags.filter((t) => t.type === "warning");

  const result: Array<{ label: string; type: "positive" | "warning" }> = [];
  if (positiveTags.length > 0) {
    result.push(positiveTags[0]);
  }
  if (result.length < 2 && positiveTags.length > 1) {
    result.push(positiveTags[1]);
  }
  if (result.length < 2 && warningTags.length > 0) {
    result.push(warningTags[0]);
  }

  return result;
}

/**
 * Compute median of an array of numbers
 */
function computeMedian(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

