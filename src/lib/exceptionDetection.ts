/**
 * Exception Detection Module
 * Layer 6: Detects SLA breaches and workflow exceptions
 * 
 * Pure functions that analyze request/order/dispatch data
 * and return exception objects. No side effects.
 */

import { RFQRequest } from "./request";
import { DispatchRecord } from "./requestDispatch";
import { Order } from "./order";
import {
  SLA_NO_RESPONSE_MINUTES,
  SLA_CONFIRM_HOURS,
  SLA_SCHEDULE_HOURS,
  SLA_DELIVERED_HOURS,
} from "./slaConfig";

/**
 * Exception types
 */
export type ExceptionType =
  | "NO_SUPPLIER_RESPONSE" // Request posted but no supplier responded within SLA
  | "CONFIRM_OVERDUE" // Order awarded but not confirmed within SLA
  | "SCHEDULE_OVERDUE" // Order confirmed but not scheduled within SLA
  | "DELIVERY_OVERDUE"; // Order scheduled but not delivered within SLA or past needBy

/**
 * Exception severity levels
 */
export type ExceptionSeverity = "info" | "warning" | "critical";

/**
 * Exception interface
 */
export interface Exception {
  id: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  message: string;
  createdAt: string; // ISO timestamp when exception was detected
  relatedIds: {
    requestId: string;
    orderId?: string;
    sellerId?: string;
  };
  isResolved: boolean; // Computed: true if the underlying issue has been resolved
}

/**
 * Input for detecting exceptions for a request
 */
export interface DetectExceptionsForRequestInput {
  request: RFQRequest;
  dispatchRecords: DispatchRecord[];
  order: Order | null;
  now: string; // ISO timestamp for "current time" (allows testing with fixed time)
}

/**
 * Input for detecting exceptions for an order
 */
export interface DetectExceptionsForOrderInput {
  order: Order;
  request: RFQRequest | null; // Optional: needed to check needBy date
  now: string; // ISO timestamp for "current time"
}

/**
 * Check if any supplier has responded to a request
 */
function hasSupplierResponded(dispatchRecords: DispatchRecord[]): boolean {
  return dispatchRecords.some((r) => r.status === "responded");
}

/**
 * Calculate minutes elapsed between two ISO timestamps
 */
function minutesElapsed(startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return (end - start) / (1000 * 60);
}

/**
 * Calculate hours elapsed between two ISO timestamps
 */
function hoursElapsed(startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return (end - start) / (1000 * 60 * 60);
}

/**
 * Find the earliest timestamp in an array of status history events
 */
function findEarliestStatusTime(
  statusHistory: Array<{ status: string; at: string }>,
  targetStatus: string
): string | null {
  const events = statusHistory.filter((e) => e.status === targetStatus);
  if (events.length === 0) return null;
  
  return events.reduce((earliest, event) => {
    const eventTime = new Date(event.at).getTime();
    const earliestTime = earliest ? new Date(earliest).getTime() : Infinity;
    return eventTime < earliestTime ? event.at : earliest;
  }, "" as string | null);
}

/**
 * Detect exceptions for a request
 * 
 * Checks:
 * - NO_SUPPLIER_RESPONSE: Request posted but no supplier responded within SLA
 * - CONFIRM_OVERDUE: Order awarded but not confirmed within SLA
 * 
 * @param input Request data, dispatch records, order, and current time
 * @returns Array of detected exceptions
 */
export function detectExceptionsForRequest(
  input: DetectExceptionsForRequestInput
): Exception[] {
  const { request, dispatchRecords, order, now } = input;
  const exceptions: Exception[] = [];

  // Only check posted requests
  if (request.status !== "posted") {
    return exceptions;
  }

  // Exception 1: NO_SUPPLIER_RESPONSE
  // Check if request was dispatched but no supplier responded within SLA
  if (dispatchRecords.length > 0) {
    const hasResponse = hasSupplierResponded(dispatchRecords);
    
    if (!hasResponse) {
      // Find earliest dispatch time
      const earliestDispatch = dispatchRecords.reduce((earliest, record) => {
        const recordTime = new Date(record.sentAt).getTime();
        const earliestTime = earliest ? new Date(earliest).getTime() : Infinity;
        return recordTime < earliestTime ? record.sentAt : earliest;
      }, "" as string);

      if (earliestDispatch) {
        const elapsedMinutes = minutesElapsed(earliestDispatch, now);
        
        if (elapsedMinutes >= SLA_NO_RESPONSE_MINUTES) {
          const severity: ExceptionSeverity = 
            elapsedMinutes >= SLA_NO_RESPONSE_MINUTES * 2 ? "critical" :
            elapsedMinutes >= SLA_NO_RESPONSE_MINUTES * 1.5 ? "warning" :
            "info";

          exceptions.push({
            id: crypto.randomUUID(),
            type: "NO_SUPPLIER_RESPONSE",
            severity,
            message: `No supplier has responded to this request yet. Posted ${Math.round(elapsedMinutes)} minutes ago.`,
            createdAt: now,
            relatedIds: {
              requestId: request.id,
            },
            isResolved: false, // Will be resolved when a supplier responds
          });
        }
      }
    }
  }

  // Exception 2: CONFIRM_OVERDUE
  // Check if order was awarded but not confirmed within SLA
  if (order && order.status === "awarded") {
    const awardedEvent = findEarliestStatusTime(order.statusHistory, "awarded");
    
    if (awardedEvent) {
      const elapsedHours = hoursElapsed(awardedEvent, now);
      
      if (elapsedHours >= SLA_CONFIRM_HOURS) {
        const severity: ExceptionSeverity =
          elapsedHours >= SLA_CONFIRM_HOURS * 2 ? "critical" :
          elapsedHours >= SLA_CONFIRM_HOURS * 1.5 ? "warning" :
          "info";

        exceptions.push({
          id: crypto.randomUUID(),
          type: "CONFIRM_OVERDUE",
          severity,
          message: `Order was awarded ${Math.round(elapsedHours)} hours ago but hasn't been confirmed by the supplier yet.`,
          createdAt: now,
          relatedIds: {
            requestId: request.id,
            orderId: order.id,
            sellerId: order.sellerId,
          },
          isResolved: false, // Will be resolved when order status changes to "confirmed"
        });
      }
    }
  }

  return exceptions;
}

/**
 * Detect exceptions for an order
 * 
 * Checks:
 * - SCHEDULE_OVERDUE: Order confirmed but not scheduled within SLA
 * - DELIVERY_OVERDUE: Order scheduled but not delivered within SLA or past needBy
 * 
 * @param input Order data, optional request (for needBy), and current time
 * @returns Array of detected exceptions
 */
export function detectExceptionsForOrder(
  input: DetectExceptionsForOrderInput
): Exception[] {
  const { order, request, now } = input;
  const exceptions: Exception[] = [];

  // Exception 3: SCHEDULE_OVERDUE
  // Check if order was confirmed but not scheduled within SLA
  if (order.status === "confirmed") {
    const confirmedEvent = findEarliestStatusTime(order.statusHistory, "confirmed");
    
    if (confirmedEvent) {
      const elapsedHours = hoursElapsed(confirmedEvent, now);
      
      if (elapsedHours >= SLA_SCHEDULE_HOURS) {
        const severity: ExceptionSeverity =
          elapsedHours >= SLA_SCHEDULE_HOURS * 2 ? "critical" :
          elapsedHours >= SLA_SCHEDULE_HOURS * 1.5 ? "warning" :
          "info";

        exceptions.push({
          id: crypto.randomUUID(),
          type: "SCHEDULE_OVERDUE",
          severity,
          message: `Order was confirmed ${Math.round(elapsedHours)} hours ago but hasn't been scheduled yet.`,
          createdAt: now,
          relatedIds: {
            requestId: order.requestId,
            orderId: order.id,
            sellerId: order.sellerId,
          },
          isResolved: false, // Will be resolved when order status changes to "scheduled"
        });
      }
    }
  }

  // Exception 4: DELIVERY_OVERDUE
  // Check if order was scheduled but not delivered within SLA or past needBy
  if (order.status === "scheduled") {
    const scheduledEvent = findEarliestStatusTime(order.statusHistory, "scheduled");
    
    if (scheduledEvent) {
      let isOverdue = false;
      let elapsedHours = 0;
      let useNeedBy = false;
      let needByTime: string | null = null;

      // Check if request has needBy date (takes precedence)
      if (request && request.delivery.needBy) {
        needByTime = request.delivery.needBy;
        const needByDate = new Date(needByTime);
        const nowDate = new Date(now);
        
        if (nowDate > needByDate) {
          isOverdue = true;
          useNeedBy = true;
          elapsedHours = hoursElapsed(needByTime, now);
        }
      } else {
        // Use SLA constant from scheduled time
        elapsedHours = hoursElapsed(scheduledEvent, now);
        isOverdue = elapsedHours >= SLA_DELIVERED_HOURS;
      }

      if (isOverdue) {
        const severity: ExceptionSeverity =
          elapsedHours >= SLA_DELIVERED_HOURS * 2 || (useNeedBy && elapsedHours >= 24) ? "critical" :
          elapsedHours >= SLA_DELIVERED_HOURS * 1.5 || (useNeedBy && elapsedHours >= 12) ? "warning" :
          "info";

        const message = useNeedBy
          ? `Order was scheduled but the need-by date (${new Date(needByTime!).toLocaleDateString()}) has passed. ${Math.round(elapsedHours)} hours overdue.`
          : `Order was scheduled ${Math.round(elapsedHours)} hours ago but hasn't been delivered yet.`;

        exceptions.push({
          id: crypto.randomUUID(),
          type: "DELIVERY_OVERDUE",
          severity,
          message,
          createdAt: now,
          relatedIds: {
            requestId: order.requestId,
            orderId: order.id,
            sellerId: order.sellerId,
          },
          isResolved: false, // Will be resolved when order status changes to "delivered"
        });
      }
    }
  }

  return exceptions;
}

/**
 * Compute isResolved for an exception
 * 
 * An exception is resolved if:
 * - NO_SUPPLIER_RESPONSE: Any dispatch record has status "responded"
 * - CONFIRM_OVERDUE: Order status is not "awarded" (moved to confirmed or later)
 * - SCHEDULE_OVERDUE: Order status is not "confirmed" (moved to scheduled or later)
 * - DELIVERY_OVERDUE: Order status is "delivered"
 * 
 * @param exception The exception to check
 * @param currentData Current state of request/order/dispatch records
 * @returns true if exception is resolved
 */
export function computeExceptionResolved(
  exception: Exception,
  currentData: {
    dispatchRecords?: DispatchRecord[];
    order?: Order | null;
  }
): boolean {
  switch (exception.type) {
    case "NO_SUPPLIER_RESPONSE":
      if (currentData.dispatchRecords) {
        return hasSupplierResponded(currentData.dispatchRecords);
      }
      return false;

    case "CONFIRM_OVERDUE":
      if (currentData.order) {
        return currentData.order.status !== "awarded";
      }
      return false;

    case "SCHEDULE_OVERDUE":
      if (currentData.order) {
        return currentData.order.status !== "confirmed";
      }
      return false;

    case "DELIVERY_OVERDUE":
      if (currentData.order) {
        return currentData.order.status === "delivered";
      }
      return false;

    default:
      return false;
  }
}

/**
 * Helper: Detect all exceptions for a request and its order
 * 
 * Convenience function that calls both detectExceptionsForRequest
 * and detectExceptionsForOrder, then computes isResolved for each.
 * 
 * @param input Combined input for request and order detection
 * @returns Array of all detected exceptions with isResolved computed
 */
export function detectAllExceptions(input: {
  request: RFQRequest;
  dispatchRecords: DispatchRecord[];
  order: Order | null;
  now: string;
}): Exception[] {
  const requestExceptions = detectExceptionsForRequest(input);
  const orderExceptions = input.order
    ? detectExceptionsForOrder({
        order: input.order,
        request: input.request,
        now: input.now,
      })
    : [];

  const allExceptions = [...requestExceptions, ...orderExceptions];

  // Compute isResolved for each exception
  return allExceptions.map((exception) => ({
    ...exception,
    isResolved: computeExceptionResolved(exception, {
      dispatchRecords: input.dispatchRecords,
      order: input.order,
    }),
  }));
}


