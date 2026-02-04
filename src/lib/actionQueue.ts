/**
 * Action Queue System
 * Converts messages into actionable items for suppliers
 * Low-signal messages are auto-handled or ignored
 */

import { Message, BuyerMessageIntent, parseThreadId } from "./messages";
import { getRequest } from "./request";
import { getOrderByRequestId } from "./order";
import { detectAllExceptions } from "./exceptionDetection";
import { getDispatchRecords } from "./requestDispatch";
import { generateMessageSummaries } from "./messageSummaries";

/**
 * Action Queue Item Types
 */
export type ActionQueueItemType =
  | "QUOTE_REQUEST"        // Buyer needs a quote (no bid yet)
  | "CLARIFICATION_REQUIRED"  // Buyer asking for clarification
  | "EXCEPTION_REVIEW"     // Exception requires seller attention
  | "CONFIRM_ORDER"        // Order needs confirmation
  | "UPDATE_REQUIRED";     // Buyer requesting update

/**
 * Action Queue Item
 */
export interface ActionQueueItem {
  id: string;
  type: ActionQueueItemType;
  requestId: string;
  buyerId: string;
  sellerId: string;
  createdAt: string; // When the action was created
  priority: "low" | "medium" | "high" | "urgent";
  title: string; // Human-readable title
  description: string; // Action description (can be a summary for batched messages)
  metadata?: {
    messageId?: string; // Source message ID if from a message (deprecated - use messageIds)
    messageIds?: string[]; // Source message IDs if from batched messages
    intent?: BuyerMessageIntent; // Buyer intent if from a message (deprecated - use intents)
    intents?: BuyerMessageIntent[]; // Buyer intents if from batched messages
    orderId?: string; // Order ID if applicable
    exceptionId?: string; // Exception ID if applicable
    isSummary?: boolean; // True if this is a batched message summary
    [key: string]: any;
  };
}

/**
 * Process messages and create action queue items
 * Messages are batched into summaries to prevent notification fatigue
 * Low-signal messages (acknowledgements, system messages) are ignored
 */
export function processMessagesIntoActions(sellerId: string): ActionQueueItem[] {
  const actions: ActionQueueItem[] = [];
  
  // Generate message summaries (batched by request)
  const messageSummaries = generateMessageSummaries(sellerId);
  
  // Convert summaries to action items
  for (const summary of messageSummaries) {
    // Check if request is in "Pending Review" state
    // In this state, supplier is NOT required to respond (silence is acceptable)
    let request;
    try {
      request = getRequest(summary.requestId);
    } catch {
      // Request not found - continue processing
    }

    // If in "Pending Review", make actions informational only (low priority, no response required)
    const isPendingReview = request?.reviewStatus === "pending_review";

    // Determine action type from intents
    let actionType: ActionQueueItemType | null = null;
    let priority: "low" | "medium" | "high" | "urgent" = "medium";
    let title = "";

    // Check for cancellation requests (highest priority, even in pending review)
    if (summary.intents.includes("CANCEL_REQUEST")) {
      actionType = "UPDATE_REQUIRED";
      priority = isPendingReview ? "low" : "urgent"; // Lower priority if pending review
      title = "Cancellation Request";
    }
    // Check for clarification needs
    else if (
      summary.intents.includes("ASK_LEAD_TIME") ||
      summary.intents.includes("ASK_PRICE") ||
      summary.intents.includes("ASK_SUBSTITUTION")
    ) {
      try {
        const order = getOrderByRequestId(summary.requestId, sellerId);
        const hasBid = !!order;
        actionType = hasBid ? "CLARIFICATION_REQUIRED" : "QUOTE_REQUEST";
        // If pending review, always low priority (no response required)
        priority = isPendingReview ? "low" : (hasBid ? "medium" : "high");
        title = hasBid ? "Clarification Required" : "Quote Request";
      } catch {
        actionType = "CLARIFICATION_REQUIRED";
        priority = isPendingReview ? "low" : "high";
        title = "Clarification Required";
      }
    }
    // Check for confirmation needs
    else if (summary.intents.includes("CONFIRM_DETAILS")) {
      try {
        const order = getOrderByRequestId(summary.requestId, sellerId);
        if (order && order.status === "awarded") {
          actionType = "CONFIRM_ORDER";
          priority = isPendingReview ? "low" : "high";
          title = "Order Confirmation Needed";
        } else {
          actionType = "CLARIFICATION_REQUIRED";
          priority = isPendingReview ? "low" : "medium";
          title = "Details Confirmation";
        }
      } catch {
        actionType = "CLARIFICATION_REQUIRED";
        priority = isPendingReview ? "low" : "medium";
        title = "Details Confirmation";
      }
    }
    // Check for update requests
    else if (summary.intents.includes("REQUEST_UPDATE")) {
      actionType = "UPDATE_REQUIRED";
      // If pending review, always low priority (no response required)
      priority = isPendingReview ? "low" : (() => {
        try {
          const order = getOrderByRequestId(summary.requestId, sellerId);
          return order ? "medium" : "low";
        } catch {
          return "low";
        }
      })();
      title = "Update Requested";
    }

    if (actionType) {
      actions.push({
        id: `summary-${summary.requestId}`,
        type: actionType,
        requestId: summary.requestId,
        buyerId: summary.buyerId,
        sellerId: summary.sellerId,
        createdAt: summary.latestMessageAt,
        priority,
        title,
        description: summary.summary, // Use batched summary as description
        metadata: {
          messageIds: summary.metadata?.messageIds || [],
          intents: summary.intents,
          isSummary: true,
          messageCount: summary.messageCount,
          isPendingReview: isPendingReview, // Flag indicating no response required
        },
      });
    }
  }

  // Add exception-based actions (process all requests)
  // TODO: Replace with API call to /api/seller/messages
  const allMessages: Message[] = [];
  const allRequestIds = new Set<string>();
  for (const message of allMessages) {
    if (!message.threadId) continue;
    const parsed = parseThreadId(message.threadId);
    if (parsed && parsed.sellerId === sellerId) {
      allRequestIds.add(parsed.requestId);
    }
  }

  // Process exceptions for all requests
  for (const requestId of allRequestIds) {
    try {
      const request = getRequest(requestId);
      if (!request) continue;

      const order = getOrderByRequestId(requestId, sellerId);
      const dispatchRecords = getDispatchRecords(requestId);
      const exceptions = detectAllExceptions({
        request,
        dispatchRecords,
        order: order || null,
        now: new Date().toISOString(),
      });

      for (const exception of exceptions) {
        if (exception.isResolved) continue;
        if (exception.relatedIds.sellerId !== sellerId) continue;

        // Only create action for exceptions that require seller response
        if (
          exception.type === "CONFIRM_OVERDUE" ||
          exception.type === "SCHEDULE_OVERDUE" ||
          exception.type === "DELIVERY_OVERDUE"
        ) {
          actions.push({
            id: `exception-${exception.id}`,
            type: "EXCEPTION_REVIEW",
            requestId,
            buyerId: request.buyerId,
            sellerId,
            createdAt: exception.createdAt,
            priority: exception.severity === "critical" ? "urgent" : exception.severity === "warning" ? "high" : "medium",
            title: "Exception Requires Attention",
            description: exception.message,
            metadata: {
              exceptionId: exception.id,
              exceptionType: exception.type,
              orderId: order?.id,
            },
          });
        }
      }
    } catch {
      // Silently fail - exceptions are optional
    }
  }

  // Deduplicate actions (same type + requestId = one action)
  const deduplicated = new Map<string, ActionQueueItem>();
  for (const action of actions) {
    const key = `${action.type}-${action.requestId}`;
    // Keep the most recent action of each type per request
    if (!deduplicated.has(key) || 
        new Date(action.createdAt).getTime() > new Date(deduplicated.get(key)!.createdAt).getTime()) {
      deduplicated.set(key, action);
    }
  }

  // Sort by priority and creation time
  const sorted = Array.from(deduplicated.values()).sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return sorted;
}

/**
 * Get action queue for a seller
 */
export function getActionQueue(sellerId: string): ActionQueueItem[] {
  return processMessagesIntoActions(sellerId);
}

