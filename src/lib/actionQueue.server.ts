/**
 * Action Queue System - Server-Only
 * Converts messages into actionable items for suppliers
 * Low-signal messages are auto-handled or ignored
 */

import "server-only";

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
 * Groups messages into summaries when appropriate
 */
export async function processMessagesIntoActions(sellerId: string): Promise<ActionQueueItem[]> {
  const summaries = generateMessageSummaries(sellerId);
  const actions: ActionQueueItem[] = [];

  for (const summary of summaries) {
    // Determine action type based on intents
    let actionType: ActionQueueItemType = "UPDATE_REQUIRED";
    let priority: "low" | "medium" | "high" | "urgent" = "medium";

    if (summary.intents.includes("CANCEL_REQUEST")) {
      actionType = "UPDATE_REQUIRED";
      priority = "urgent";
    } else if (summary.intents.includes("ASK_PRICE") || summary.intents.includes("ASK_LEAD_TIME")) {
      actionType = "QUOTE_REQUEST";
      priority = "high";
    } else if (summary.intents.includes("CONFIRM_DETAILS")) {
      actionType = "CONFIRM_ORDER";
      priority = "high";
    } else if (summary.intents.includes("ASK_SUBSTITUTION")) {
      actionType = "CLARIFICATION_REQUIRED";
      priority = "medium";
    }

    // Check for exceptions that require attention
    const request = await getRequest(summary.requestId);
    if (request) {
      const dispatchRecords = getDispatchRecords(summary.requestId);
      const order = getOrderByRequestId(summary.requestId, sellerId);
      const exceptions = detectAllExceptions({
        request,
        dispatchRecords,
        order: order || null,
        now: new Date().toISOString(),
      });

      const criticalExceptions = exceptions.filter((ex) => ex.severity === "critical" && !ex.isResolved);
      if (criticalExceptions.length > 0) {
        actionType = "EXCEPTION_REVIEW";
        priority = "urgent";
      }
    }

    actions.push({
      id: `action-${summary.requestId}-${summary.sellerId}-${Date.now()}`,
      type: actionType,
      requestId: summary.requestId,
      buyerId: summary.buyerId,
      sellerId: summary.sellerId,
      createdAt: summary.latestMessageAt,
      priority,
      title: summary.summary,
      description: summary.summary,
      metadata: {
        messageIds: summary.metadata?.messageIds || [],
        intents: summary.intents,
        isSummary: summary.messageCount > 1,
      },
    });
  }

  // Sort by priority and creation time
  const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
  return actions.sort((a, b) => {
    const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Get action queue for a seller
 */
export async function getActionQueue(sellerId: string): Promise<ActionQueueItem[]> {
  return processMessagesIntoActions(sellerId);
}

