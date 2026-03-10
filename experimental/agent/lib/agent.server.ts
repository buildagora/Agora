/**
 * Communication Agent - Server-Only
 * Deterministic agent that processes buyer intents and makes decisions
 * 
 * This module contains server-only functions that require database access.
 * Client components should use API routes that call these functions.
 */

import "server-only";

import { Message, BuyerMessageIntent } from "./messages";
import { RFQRequest, getRequest } from "./request";
import { Order, getOrderByRequestId } from "./order";
import { detectAllExceptions } from "./exceptionDetection";
import { getDispatchRecords } from "./requestDispatch";

/**
 * Agent decision types
 */
export type AgentDecision =
  | { type: "AUTO_RESPOND"; response: string; confidence: number }
  | { type: "UPDATE_FIELDS"; updates: StructuredFieldUpdate[]; confidence: number }
  | { type: "ESCALATE"; reason: string; confidence: number };

/**
 * Structured field updates that the agent can make
 */
export interface StructuredFieldUpdate {
  field: "price" | "leadTime" | "deliveryDate" | "deliveryAddress" | "pickupDate" | "pickupLocation";
  value: string | number;
  reason: string;
}

/**
 * Agent context (all information needed to make decisions)
 */
export interface AgentContext {
  message: Message;
  request: RFQRequest;
  order: Order | null;
  sellerBid: any; // Bid/Quote object
  sellerId: string;
  dispatchRecords: any[];
  exceptions: any[];
}

/**
 * Agent decision result
 */
export interface AgentDecisionResult {
  decision: AgentDecision;
  context: AgentContext;
  metadata?: {
    intent: BuyerMessageIntent;
    detectedConflicts?: string[];
    detectedThreats?: string[];
  };
}

/**
 * Process a buyer message through the agent
 * 
 * @param message Buyer message with intent
 * @param sellerId Seller ID to process for
 * @returns Agent decision result
 */
export async function processBuyerMessage(
  message: Message,
  sellerId: string
): Promise<AgentDecisionResult> {
  // Extract intent
  const intent = message.metadata?.intent as BuyerMessageIntent | undefined;
  if (!intent) {
    return {
      decision: {
        type: "ESCALATE",
        reason: "No intent specified in message",
        confidence: 0.5,
      },
      context: {} as AgentContext,
      metadata: { intent: "REQUEST_UPDATE" as BuyerMessageIntent }, // Default intent for error case
    };
  }

  // Gather context
  const context = await gatherContext(message, sellerId);
  if (!context.request || !context.request.id) {
    return {
      decision: {
        type: "ESCALATE",
        reason: "Request not found",
        confidence: 0.3,
      },
      context: {} as AgentContext,
      metadata: { intent },
    };
  }

  // Make decision based on intent and context
  const decision = makeDecision(intent, context, message);

  return {
    decision,
    context,
    metadata: {
      intent,
      detectedConflicts: detectConflicts(message, context),
      detectedThreats: detectThreats(message),
    },
  };
}

/**
 * Gather all context needed for decision-making
 */
async function gatherContext(message: Message, sellerId: string): Promise<AgentContext> {
  // Parse threadId to get requestId
  const threadId = message.threadId;
  if (!threadId) {
    return {} as AgentContext;
  }

  // Extract requestId from threadId (format: thread:rq=<requestId>|b=<buyerId>|s=<sellerId>)
  const match = threadId.match(/thread:rq=([^|]+)/);
  if (!match) {
    return {} as AgentContext;
  }

  const requestId = match[1];

  // Get request (already imported at top)
  const request = await getRequest(requestId);

  // Get order (already imported at top)
  const order = getOrderByRequestId(requestId, sellerId);

  // Get seller's bid
  // TODO: Replace with API call to /api/seller/bids
  const allBids: any[] = [];
  const sellerBid = allBids.find((b) => b.rfqId === requestId && b.sellerId === sellerId);

  // Get dispatch records
  const dispatchRecords = getDispatchRecords(requestId);

  // Detect exceptions
  const exceptions = request
    ? detectAllExceptions({
        request,
        dispatchRecords,
        order: order || null,
        now: new Date().toISOString(),
      })
    : [];

  return {
    message,
    request: request || ({} as RFQRequest),
    order: order || null,
    sellerBid: sellerBid || null,
    sellerId,
    dispatchRecords,
    exceptions,
  };
}

/**
 * Make decision based on intent and context
 * Deterministic if/else logic
 */
function makeDecision(
  intent: BuyerMessageIntent,
  context: AgentContext,
  message: Message
): AgentDecision {
  const { sellerBid: _sellerBid, exceptions } = context;

  // ESCALATION CRITERIA (checked first)
  // Escalate ONLY for:
  // 1. Cancellation threats
  // 2. SLA breaches
  // 3. Pricing or fulfillment conflicts
  // 4. Order confirmation overdue

  // 1. Cancellation threats
  if (intent === "CANCEL_REQUEST" || detectCancellationThreat(message)) {
    return {
      type: "ESCALATE",
      reason: "Cancellation threat detected",
      confidence: 1.0,
    };
  }

  // 2. SLA breaches
  const hasSlaBreach = exceptions.some(
    (ex) =>
      ex.type === "NO_SUPPLIER_RESPONSE" ||
      ex.type === "SCHEDULE_OVERDUE" ||
      ex.type === "DELIVERY_OVERDUE"
  );
  if (hasSlaBreach) {
    return {
      type: "ESCALATE",
      reason: "SLA breach detected",
      confidence: 1.0,
    };
  }

  // 3. Order confirmation overdue
  const confirmOverdue = exceptions.some((ex) => ex.type === "CONFIRM_OVERDUE");
  if (confirmOverdue) {
    return {
      type: "ESCALATE",
      reason: "Order confirmation overdue",
      confidence: 1.0,
    };
  }

  // 4. Pricing or fulfillment conflicts
  const conflicts = detectPricingOrFulfillmentConflict(message, context);
  if (conflicts.length > 0) {
    return {
      type: "ESCALATE",
      reason: `Conflict detected: ${conflicts.join(", ")}`,
      confidence: 0.9,
    };
  }

  // AUTO-RESPOND DECISIONS (deterministic logic)
  switch (intent) {
    case "ASK_PRICE":
      return handleAskPrice(context, message);

    case "ASK_LEAD_TIME":
      return handleAskLeadTime(context, message);

    case "CONFIRM_DETAILS":
      return handleConfirmDetails(context, message);

    case "REQUEST_UPDATE":
      return handleRequestUpdate(context, message);

    case "ASK_SUBSTITUTION":
      return {
        type: "AUTO_RESPOND",
        response: "We'll review substitution options and respond with our quote.",
        confidence: 0.8,
      };

    default:
      return {
        type: "AUTO_RESPOND",
        response: "Request received. We'll review and respond shortly.",
        confidence: 0.7,
      };
  }
}

/**
 * Handle ASK_PRICE intent
 */
function handleAskPrice(
  context: AgentContext,
  _message: Message
): AgentDecision {
  const { sellerBid } = context;

  // If seller has already submitted a bid, respond with quote
  if (sellerBid) {
    const total = sellerBid.lineItems?.reduce((sum: number, item: any) => {
      const qty = parseFloat(item.quantity || "0");
      const price = parseFloat(item.unitPrice || "0");
      return sum + qty * price;
    }, 0) || 0;

    if (total > 0) {
      return {
        type: "AUTO_RESPOND",
        response: `Quote submitted: $${total.toFixed(2)}. Pending buyer review.`,
        confidence: 0.95,
      };
    }
  }

  // No bid yet - auto-respond generically
  return {
    type: "AUTO_RESPOND",
    response: "Quote pending review. We'll respond shortly.",
    confidence: 0.85,
  };
}

/**
 * Handle ASK_LEAD_TIME intent
 */
function handleAskLeadTime(
  context: AgentContext,
  _message: Message
): AgentDecision {
  const { sellerBid } = context;

  // If seller has submitted a bid with lead time, respond with it
  if (sellerBid?.leadTimeDays) {
    const leadTime = sellerBid.leadTimeDays;
    return {
      type: "AUTO_RESPOND",
      response: `Estimated lead time: ${leadTime} day${leadTime !== 1 ? "s" : ""}.`,
      confidence: 0.95,
    };
  }

  // No lead time in bid yet - auto-respond generically
  return {
    type: "AUTO_RESPOND",
    response: "Lead time will be provided with quote submission.",
    confidence: 0.8,
  };
}

/**
 * Handle CONFIRM_DETAILS intent
 */
function handleConfirmDetails(
  context: AgentContext,
  _message: Message
): AgentDecision {
  const { order } = context;

  // If order is already confirmed, auto-respond
  if (order && order.status === "confirmed") {
    return {
      type: "AUTO_RESPOND",
      response: "Order details confirmed. Proceeding with fulfillment.",
      confidence: 0.95,
    };
  }

  // If order is awarded but not confirmed, provide status
  if (order && order.status === "awarded") {
    return {
      type: "AUTO_RESPOND",
      response: "Order awarded. Awaiting confirmation.",
      confidence: 0.85,
    };
  }

  // No order yet - likely just confirming request details
  return {
    type: "AUTO_RESPOND",
    response: "Request details confirmed. Quote in progress.",
    confidence: 0.8,
  };
}

/**
 * Handle REQUEST_UPDATE intent
 */
function handleRequestUpdate(
  context: AgentContext,
  _message: Message
): AgentDecision {
  const { order, sellerBid } = context;

  // Build status update based on current state
  let statusUpdate = "";

  if (order) {
    switch (order.status) {
      case "awarded":
        statusUpdate = "Order awarded. Awaiting confirmation.";
        break;
      case "confirmed":
        statusUpdate = "Order confirmed. Scheduling in progress.";
        break;
      case "scheduled":
        statusUpdate = "Order scheduled. Delivery in progress.";
        break;
      case "delivered":
        statusUpdate = "Order delivered.";
        break;
      case "cancelled":
        statusUpdate = "Order cancelled.";
        break;
      default:
        statusUpdate = `Order status: ${order.status}.`;
    }
  } else if (sellerBid) {
    statusUpdate = "Quote submitted. Pending buyer review.";
  } else {
    statusUpdate = "Request received. Quote in preparation.";
  }

  return {
    type: "AUTO_RESPOND",
    response: statusUpdate,
    confidence: 0.9,
  };
}

/**
 * Detect cancellation threats in message
 */
function detectCancellationThreat(message: Message): boolean {
  if (message.metadata?.intent === "CANCEL_REQUEST") {
    return true;
  }

  const body = (message.body || "").toLowerCase();
  const optionalText = (message.metadata?.optionalText || "").toLowerCase();
  const fullText = `${body} ${optionalText}`.toLowerCase();

  const cancellationKeywords = [
    "cancel",
    "cancellation",
    "terminate",
    "end",
    "stop",
    "withdraw",
    "no longer needed",
    "not proceeding",
  ];

  return cancellationKeywords.some((keyword) => fullText.includes(keyword));
}

/**
 * Detect pricing or fulfillment conflicts
 * Returns array of conflict types detected
 */
function detectPricingOrFulfillmentConflict(
  message: Message,
  _context: AgentContext
): string[] {
  const body = (message.body || "").toLowerCase();
  const optionalText = (message.metadata?.optionalText || "").toLowerCase();
  const fullText = `${body} ${optionalText}`.toLowerCase();

  const conflicts: string[] = [];

  // Check for price change requests
  const priceChangeKeywords = [
    "lower price",
    "reduce price",
    "cheaper",
    "discount",
    "price change",
    "adjust price",
    "negotiate price",
  ];
  if (priceChangeKeywords.some((keyword) => fullText.includes(keyword))) {
    conflicts.push("price_change");
  }

  // Check for fulfillment change requests
  const fulfillmentChangeKeywords = [
    "change delivery",
    "different address",
    "change pickup",
    "different location",
    "earlier delivery",
    "later delivery",
    "change date",
    "different date",
  ];
  if (fulfillmentChangeKeywords.some((keyword) => fullText.includes(keyword))) {
    conflicts.push("fulfillment_change");
  }

  // Check for lead time change requests
  const leadTimeChangeKeywords = [
    "faster",
    "sooner",
    "rush",
    "expedite",
    "urgent",
    "change lead time",
    "shorter lead time",
  ];
  if (leadTimeChangeKeywords.some((keyword) => fullText.includes(keyword))) {
    conflicts.push("lead_time_change");
  }

  return conflicts;
}

/**
 * Detect threats in message
 */
function detectThreats(message: Message): string[] {
  const threats: string[] = [];

  if (detectCancellationThreat(message)) {
    threats.push("cancellation");
  }

  return threats;
}

/**
 * Detect conflicts in message
 */
function detectConflicts(message: Message, context: AgentContext): string[] {
  return detectPricingOrFulfillmentConflict(message, context);
}


