/**
 * Message Summary System
 * Batches buyer messages into summaries for Action Queue
 * Prevents notification fatigue by grouping messages
 */

import { Message, BuyerMessageIntent, parseThreadId } from "./messages";
import { autoResolveBuyerIntent } from "./autoResolution";

/**
 * Message summary for a request
 */
export interface MessageSummary {
  requestId: string;
  buyerId: string;
  sellerId: string;
  summary: string; // Human-readable summary like "3 buyer updates today"
  messageCount: number; // Number of messages in this summary
  latestMessageAt: string; // ISO timestamp of most recent message
  intents: BuyerMessageIntent[]; // Unique intents in this batch
  metadata?: {
    messageIds: string[]; // IDs of messages in this summary
    [key: string]: any;
  };
}

/**
 * Generate message summaries for a seller
 * Groups unread buyer messages by request and creates summaries
 */
export function generateMessageSummaries(sellerId: string): MessageSummary[] {
  const allMessages = readUserJson<Message[]>(sellerId, "messages", []);
  const now = new Date();

  // Filter to unread buyer messages that need escalation
  const unreadBuyerMessages = allMessages.filter((message) => {
    // Only buyer messages
    if (message.senderRole !== "BUYER") return false;
    
    // Must have intent
    if (!message.metadata?.intent) return false;
    
    // Must be unread by seller
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    if (readBy.includes(sellerId)) return false;
    
    // Check if auto-resolvable (if auto-resolved, don't include in summary)
    try {
      const autoResolution = autoResolveBuyerIntent(message, sellerId);
      if (!autoResolution.shouldEscalate) return false;
    } catch {
      // If auto-resolution fails, include it (safe fallback)
    }
    
    return true;
  });

  // Group messages by request
  const messagesByRequest = new Map<string, Message[]>();
  for (const message of unreadBuyerMessages) {
    if (!message.threadId) continue;
    
    const parsed = parseThreadId(message.threadId);
    if (!parsed || parsed.sellerId !== sellerId) continue;
    
    const requestId = parsed.requestId;
    if (!messagesByRequest.has(requestId)) {
      messagesByRequest.set(requestId, []);
    }
    messagesByRequest.get(requestId)!.push(message);
  }

  // Generate summaries for each request
  const summaries: MessageSummary[] = [];
  for (const [requestId, messages] of messagesByRequest.entries()) {
    if (messages.length === 0) continue;

    // Sort by creation time (newest first)
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const latestMessage = sortedMessages[0];
    const parsed = parseThreadId(latestMessage.threadId!);
    if (!parsed) continue;

    // Count messages by intent
    const intentCounts = new Map<BuyerMessageIntent, number>();
    const uniqueIntents = new Set<BuyerMessageIntent>();
    
    for (const msg of messages) {
      const intent = msg.metadata?.intent as BuyerMessageIntent | undefined;
      if (intent) {
        uniqueIntents.add(intent);
        intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
      }
    }

    // Generate summary text
    let summaryText = "";
    if (messages.length === 1) {
      // Single message
      const intent = sortedMessages[0].metadata?.intent as BuyerMessageIntent | undefined;
      if (intent === "REQUEST_UPDATE") {
        summaryText = "1 buyer update";
      } else if (intent === "ASK_LEAD_TIME" || intent === "ASK_PRICE") {
        summaryText = "1 request requires clarification";
      } else if (intent === "CONFIRM_DETAILS") {
        summaryText = "1 confirmation request";
      } else if (intent === "CANCEL_REQUEST") {
        summaryText = "1 cancellation request";
      } else {
        summaryText = "1 buyer message";
      }
    } else {
      // Multiple messages - create aggregate summary
      const updateCount = intentCounts.get("REQUEST_UPDATE") || 0;
      const clarificationCount = (intentCounts.get("ASK_LEAD_TIME") || 0) + 
                                  (intentCounts.get("ASK_PRICE") || 0) +
                                  (intentCounts.get("ASK_SUBSTITUTION") || 0);
      const confirmCount = intentCounts.get("CONFIRM_DETAILS") || 0;
      const cancelCount = intentCounts.get("CANCEL_REQUEST") || 0;

      const parts: string[] = [];
      if (updateCount > 0) {
        parts.push(`${updateCount} buyer update${updateCount > 1 ? "s" : ""}`);
      }
      if (clarificationCount > 0) {
        parts.push(`${clarificationCount} request${clarificationCount > 1 ? "s" : ""} require${clarificationCount === 1 ? "s" : ""} clarification`);
      }
      if (confirmCount > 0) {
        parts.push(`${confirmCount} confirmation request${confirmCount > 1 ? "s" : ""}`);
      }
      if (cancelCount > 0) {
        parts.push(`${cancelCount} cancellation request${cancelCount > 1 ? "s" : ""}`);
      }

      if (parts.length > 0) {
        summaryText = parts.join(", ");
      } else {
        summaryText = `${messages.length} buyer messages`;
      }
    }

    // Add time context if messages are from today
    const latestDate = new Date(latestMessage.createdAt);
    const isToday = latestDate.toDateString() === now.toDateString();
    if (isToday) {
      summaryText += " today";
    }

    summaries.push({
      requestId,
      buyerId: parsed.buyerId,
      sellerId: parsed.sellerId,
      summary: summaryText,
      messageCount: messages.length,
      latestMessageAt: latestMessage.createdAt,
      intents: Array.from(uniqueIntents),
      metadata: {
        messageIds: messages.map((m) => m.id),
      },
    });
  }

  // Sort by latest message time (newest first)
  return summaries.sort(
    (a, b) => new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime()
  );
}

