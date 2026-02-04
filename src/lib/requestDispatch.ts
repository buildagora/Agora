/**
 * Request Dispatch Management
 * Handles dispatching posted requests to suppliers
 */

import { RFQRequest, getRequest } from "./request";
import { routeSuppliersForRequest, type RoutingResult } from "./requestRouting";
import { generateThreadId, createSystemMessage } from "./messages";
import { SLA_NO_RESPONSE_MINUTES } from "./slaConfig";
import { logEvent } from "./eventLog";

/**
 * Dispatch record
 */
export interface DispatchRecord {
  requestId: string; // Request ID
  sellerId: string; // Seller user ID
  phase: "primary" | "fallback"; // Routing phase
  status: "sent" | "opened" | "responded" | "expired"; // Dispatch status
  sentAt: string; // ISO timestamp when dispatched
  respondedAt?: string; // ISO timestamp when seller responded (if applicable)
}

/**
 * Get dispatch records for a request
 * @param requestId Request ID
 * @returns Array of dispatch records
 */
export function getDispatchRecords(requestId: string): DispatchRecord[] {
  // TODO: Replace with API call or DB query
  // Dispatch records are now stored in database via API
  return [];
}

/**
 * Save dispatch records for a request
 * @param requestId Request ID
 * @param records Array of dispatch records
 */
function saveDispatchRecords(requestId: string, records: DispatchRecord[]): void {
  // TODO: Replace with API call or DB write
  // Dispatch records are now stored in database via API
}

/**
 * Check if a request has already been dispatched
 * @param requestId Request ID
 * @returns true if dispatch records exist
 */
export function isRequestDispatched(requestId: string): boolean {
  const records = getDispatchRecords(requestId);
  return records.length > 0;
}

/**
 * Get dispatch records for a seller
 * @param sellerId Seller user ID
 * @returns Array of dispatch records
 */
export function getDispatchRecordsForSeller(sellerId: string): DispatchRecord[] {
  // TODO: Replace with API call or DB query
  // Dispatch records are now stored in database via API
  return [];
}

/**
 * Update dispatch record status
 * @param requestId Request ID
 * @param sellerId Seller ID
 * @param status New status
 * @param respondedAt Optional response timestamp
 */
export function updateDispatchStatus(
  requestId: string,
  sellerId: string,
  status: DispatchRecord["status"],
  respondedAt?: string
): void {
  const records = getDispatchRecords(requestId);
  const recordIndex = records.findIndex(
    (r) => r.requestId === requestId && r.sellerId === sellerId
  );

  if (recordIndex >= 0) {
    records[recordIndex].status = status;
    if (respondedAt) {
      records[recordIndex].respondedAt = respondedAt;
    }
    saveDispatchRecords(requestId, records);
  }
}

/**
 * Mark a dispatch record as responded
 * Called when a seller sends a message or submits a bid
 * 
 * @param requestId Request ID
 * @param sellerId Seller ID
 */
export function markDispatchAsResponded(requestId: string, sellerId: string): void {
  // Check if already responded (idempotency check)
  const records = getDispatchRecords(requestId);
  const existingRecord = records.find(
    (r) => r.requestId === requestId && r.sellerId === sellerId
  );
  
  // If already responded, don't log event again
  const wasAlreadyResponded = existingRecord?.status === "responded";
  
  const now = new Date().toISOString();
  updateDispatchStatus(requestId, sellerId, "responded", now);
  
  if (process.env.NODE_ENV === "development") {
    console.log("✅ DISPATCH_MARKED_RESPONDED", {
      requestId,
      sellerId,
      timestamp: now,
      wasAlreadyResponded,
    });
  }

  // Log event: SUPPLIER_RESPONDED (only if this is the first response)
  if (!wasAlreadyResponded) {
    try {
      // Try to get buyerId from request (if available)
      let buyerId: string | undefined;
      try {
        const request = getRequest(requestId);
        buyerId = request?.buyerId;
      } catch {
        // Silently continue if request not found
      }

      logEvent({
        type: "SUPPLIER_RESPONDED",
        requestId,
        buyerId,
        sellerId,
      });
    } catch (error) {
      // Silently fail - event logging should not break response marking
      if (process.env.NODE_ENV === "development") {
        console.error("Error logging SUPPLIER_RESPONDED event:", error);
      }
    }
  }
}

/**
 * Dispatch a posted request to suppliers
 * Creates dispatch records, messaging threads, and system messages
 * Idempotent: will not duplicate if already dispatched
 * 
 * @param request Request object (must have status "posted")
 * @returns Dispatch result with counts
 */
export function dispatchRequestToSuppliers(request: RFQRequest): {
  primaryCount: number;
  fallbackCount: number;
  totalDispatched: number;
} {
  // Validate request status
  if (request.status !== "posted") {
    throw new Error(`dispatchRequestToSuppliers: Request must have status "posted", got "${request.status}"`);
  }

  // Check if already dispatched (idempotency)
  if (isRequestDispatched(request.id)) {
    const existingRecords = getDispatchRecords(request.id);
    const primaryCount = existingRecords.filter((r) => r.phase === "primary").length;
    const fallbackCount = existingRecords.filter((r) => r.phase === "fallback").length;
    
    if (process.env.NODE_ENV === "development") {
      console.log("🔄 DISPATCH_SKIP (already dispatched)", {
        requestId: request.id,
        existingCount: existingRecords.length,
      });
    }
    
    return {
      primaryCount,
      fallbackCount,
      totalDispatched: existingRecords.length,
    };
  }

  // Compute routing
  const routing: RoutingResult = routeSuppliersForRequest(request);

  // Create dispatch records and messaging threads
  const dispatchRecords: DispatchRecord[] = [];
  const now = new Date().toISOString();

  // Generate request summary for system message
  const requestSummary = request.jobName || `Request ${request.id.substring(0, 8)}`;
  const itemCount = request.items.length;
  const itemSummary = itemCount === 1 
    ? "1 item" 
    : `${itemCount} items`;

  // Dispatch to primary suppliers
  for (const sellerId of routing.primary) {
    // Create dispatch record
    const dispatchRecord: DispatchRecord = {
      requestId: request.id,
      sellerId,
      phase: "primary",
      status: "sent",
      sentAt: now,
    };
    dispatchRecords.push(dispatchRecord);

    // Create messaging thread
    const threadId = generateThreadId(request.id, request.buyerId, sellerId);
    
    // Send system message
    createSystemMessage(
      threadId,
      `New request received: ${requestSummary} (${itemSummary})`,
      {
        eventType: "REQUEST_DISPATCHED",
        requestId: request.id,
        phase: "primary",
      }
    );

    if (process.env.NODE_ENV === "development") {
      console.log("📤 DISPATCH_PRIMARY", {
        requestId: request.id,
        sellerId,
        threadId,
      });
    }

    // Log event: DISPATCH_SENT
    try {
      logEvent({
        type: "DISPATCH_SENT",
        requestId: request.id,
        buyerId: request.buyerId,
        sellerId,
        metadata: {
          phase: "primary",
        },
      });
    } catch (error) {
      // Silently fail - event logging should not break dispatch
      if (process.env.NODE_ENV === "development") {
        console.error("Error logging DISPATCH_SENT event:", error);
      }
    }
  }

  // Dispatch to fallback suppliers (if any)
  for (const sellerId of routing.fallback) {
    // Create dispatch record
    const dispatchRecord: DispatchRecord = {
      requestId: request.id,
      sellerId,
      phase: "fallback",
      status: "sent",
      sentAt: now,
    };
    dispatchRecords.push(dispatchRecord);

    // Create messaging thread
    const threadId = generateThreadId(request.id, request.buyerId, sellerId);
    
    // Send system message
    createSystemMessage(
      threadId,
      `New request received: ${requestSummary} (${itemSummary})`,
      {
        eventType: "REQUEST_DISPATCHED",
        requestId: request.id,
        phase: "fallback",
      }
    );

    if (process.env.NODE_ENV === "development") {
      console.log("📤 DISPATCH_FALLBACK", {
        requestId: request.id,
        sellerId,
        threadId,
      });
    }
  }

  // Save all dispatch records
  if (dispatchRecords.length > 0) {
    saveDispatchRecords(request.id, dispatchRecords);
  }

  if (process.env.NODE_ENV === "development") {
    console.log("✅ DISPATCH_COMPLETE", {
      requestId: request.id,
      primaryCount: routing.primary.length,
      fallbackCount: routing.fallback.length,
      totalDispatched: dispatchRecords.length,
    });
  }

  return {
    primaryCount: routing.primary.length,
    fallbackCount: routing.fallback.length,
    totalDispatched: dispatchRecords.length,
  };
}

/**
 * Configuration for fallback expansion
 * Uses SLA constant for consistency
 */
const FALLBACK_EXPANSION_CONFIG = {
  RESPONSE_TIMEOUT_MINUTES: SLA_NO_RESPONSE_MINUTES, // Time to wait before expanding to fallback
} as const;

/**
 * Check if any supplier has responded to a request
 * A supplier has responded if:
 * - They submitted a bid, OR
 * - They sent a message in the thread
 * 
 * @param requestId Request ID
 * @returns true if at least one dispatch record has status "responded"
 */
function hasSupplierResponded(requestId: string): boolean {
  const records = getDispatchRecords(requestId);
  return records.some((r) => r.status === "responded");
}

/**
 * Check if fallback suppliers have already been dispatched
 * @param requestId Request ID
 * @returns true if any fallback dispatch records exist
 */
function isFallbackDispatched(requestId: string): boolean {
  const records = getDispatchRecords(requestId);
  return records.some((r) => r.phase === "fallback");
}

/**
 * Check and expand to fallback suppliers if conditions are met
 * 
 * Conditions:
 * - Request was dispatched to primary suppliers
 * - No supplier has responded (no bids)
 * - Enough time has passed since primary dispatch
 * - Fallback has not been dispatched yet
 * 
 * @param request Request object
 * @returns Dispatch result if fallback was expanded, null otherwise
 */
export function checkAndExpandFallback(request: RFQRequest): {
  primaryCount: number;
  fallbackCount: number;
  totalDispatched: number;
} | null {
  // Only check posted requests
  if (request.status !== "posted") {
    return null;
  }

  // Check if request was dispatched at all
  const existingRecords = getDispatchRecords(request.id);
  if (existingRecords.length === 0) {
    // Request was never dispatched - don't expand
    return null;
  }

  // Check if fallback was already dispatched
  if (isFallbackDispatched(request.id)) {
    // Fallback already dispatched - idempotent
    const primaryCount = existingRecords.filter((r) => r.phase === "primary").length;
    const fallbackCount = existingRecords.filter((r) => r.phase === "fallback").length;
    return {
      primaryCount,
      fallbackCount,
      totalDispatched: existingRecords.length,
    };
  }

  // Check if any supplier has responded
  if (hasSupplierResponded(request.id)) {
    // At least one supplier responded - don't expand
    return null;
  }

  // Check if enough time has passed since primary dispatch
  const primaryRecords = existingRecords.filter((r) => r.phase === "primary");
  if (primaryRecords.length === 0) {
    // No primary records - nothing to expand from
    return null;
  }

  // Find the earliest primary dispatch time
  const earliestDispatch = primaryRecords.reduce((earliest, record) => {
    const recordTime = new Date(record.sentAt).getTime();
    const earliestTime = earliest ? new Date(earliest).getTime() : Infinity;
    return recordTime < earliestTime ? record.sentAt : earliest;
  }, "" as string);

  if (!earliestDispatch) {
    return null;
  }

  // Calculate time elapsed
  const dispatchTime = new Date(earliestDispatch).getTime();
  const now = new Date().getTime();
  const elapsedMinutes = (now - dispatchTime) / (1000 * 60);

  // Check if timeout has been reached
  if (elapsedMinutes < FALLBACK_EXPANSION_CONFIG.RESPONSE_TIMEOUT_MINUTES) {
    // Not enough time has passed
    return null;
  }

  // All conditions met - dispatch fallback suppliers
  if (process.env.NODE_ENV === "development") {
    console.log("🔄 EXPANDING_FALLBACK", {
      requestId: request.id,
      elapsedMinutes: elapsedMinutes.toFixed(1),
      timeoutMinutes: FALLBACK_EXPANSION_CONFIG.RESPONSE_TIMEOUT_MINUTES,
    });
  }

  // Get routing to find fallback suppliers
  const routing = routeSuppliersForRequest(request);

  // Only dispatch fallback suppliers (primary were already dispatched)
  const fallbackSellerIds = routing.fallback;
  if (fallbackSellerIds.length === 0) {
    // No fallback suppliers available
    return null;
  }

  // Create dispatch records and messaging threads for fallback suppliers
  const dispatchRecords: DispatchRecord[] = [];
  const nowISO = new Date().toISOString();

  // Generate request summary for system message
  const requestSummary = request.jobName || `Request ${request.id.substring(0, 8)}`;
  const itemCount = request.items.length;
  const itemSummary = itemCount === 1 ? "1 item" : `${itemCount} items`;

  for (const sellerId of fallbackSellerIds) {
    // Create dispatch record
    const dispatchRecord: DispatchRecord = {
      requestId: request.id,
      sellerId,
      phase: "fallback",
      status: "sent",
      sentAt: nowISO,
    };
    dispatchRecords.push(dispatchRecord);

    // Create messaging thread
    const threadId = generateThreadId(request.id, request.buyerId, sellerId);
    
    // Send system message
    createSystemMessage(
      threadId,
      `New request received: ${requestSummary} (${itemSummary})`,
      {
        eventType: "REQUEST_DISPATCHED",
        requestId: request.id,
        phase: "fallback",
        expanded: true, // Indicate this was expanded from primary
      }
    );

    if (process.env.NODE_ENV === "development") {
      console.log("📤 DISPATCH_FALLBACK_EXPANDED", {
        requestId: request.id,
        sellerId,
        threadId,
      });
    }
  }

  // Append fallback dispatch records to existing records
  const allRecords = [...existingRecords, ...dispatchRecords];
  saveDispatchRecords(request.id, allRecords);

  // Send system message to buyer's thread indicating auto-expansion
  const buyerThreadId = generateThreadId(request.id, request.buyerId, "__unassigned__");
  createSystemMessage(
    buyerThreadId,
    `No response yet; expanded to ${fallbackSellerIds.length} additional supplier${fallbackSellerIds.length === 1 ? "" : "s"}.`,
    {
      eventType: "FALLBACK_AUTO_EXPANDED",
      requestId: request.id,
      fallbackCount: fallbackSellerIds.length,
      autoExpanded: true,
    }
  );

  if (process.env.NODE_ENV === "development") {
    console.log("✅ FALLBACK_EXPANSION_COMPLETE", {
      requestId: request.id,
      fallbackCount: fallbackSellerIds.length,
      totalDispatched: allRecords.length,
    });
  }

  const primaryCount = existingRecords.filter((r) => r.phase === "primary").length;
  return {
    primaryCount,
    fallbackCount: fallbackSellerIds.length,
    totalDispatched: allRecords.length,
  };
}

