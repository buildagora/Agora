/**
 * Message thread management
 * Canonical Thread + Message model for the Agora app
 */

// Removed storage imports - messages are now stored in database via API
// Functions that previously used storage now return empty arrays or no-op
// Removed unused markDispatchAsResponded import

/**
 * Buyer message intent types (structured messaging)
 */
export type BuyerMessageIntent =
  | "REQUEST_UPDATE"
  | "ASK_LEAD_TIME"
  | "ASK_PRICE"
  | "ASK_SUBSTITUTION"
  | "CONFIRM_DETAILS"
  | "CANCEL_REQUEST";

/**
 * Supplier response action types (structured messaging)
 */
export type SupplierResponseAction =
  | "QUOTE_SUBMITTED"
  | "NEED_CLARIFICATION"
  | "UNABLE_TO_QUOTE"
  | "UPDATED_LEAD_TIME"
  | "UPDATED_PRICE"
  | "DECLINE_REQUEST";

/**
 * Canonical Message interface - single source of truth
 */
export interface Message {
  id: string;
  threadId: string; // Format: thread:rq=<requestId>|b=<buyerId>|s=<sellerId>
  senderId: string; // User ID who sent the message (or "system" for system messages)
  senderRole: "BUYER" | "SELLER" | "SYSTEM"; // Role of the sender
  body: string; // Message content
  createdAt: string; // ISO timestamp
  readBy: string[]; // Array of user IDs who have read this message
  metadata?: Record<string, any>; // Optional metadata (e.g., attachments, reactions, intent, etc.)
  
  // Legacy fields for backwards compatibility (deprecated, will be removed in future)
  /** @deprecated Use senderRole instead */
  fromRole?: "BUYER" | "SELLER";
  /** @deprecated Use senderId to lookup user name instead */
  fromName?: string;
  /** @deprecated Use threadId parsing instead */
  rfqId?: string;
  /** @deprecated Use threadId parsing instead */
  buyerId?: string;
  /** @deprecated Use threadId parsing instead */
  sellerId?: string;
  /** @deprecated Use readBy array instead */
  seenByBuyerAt?: string | null;
  /** @deprecated Use readBy array instead */
  seenBySellerAt?: string | null;
}

/**
 * Thread summary - lightweight representation of a message thread
 */
export interface ThreadSummary {
  threadId: string; // Format: thread:rq=<requestId>|b=<buyerId>|s=<sellerId>
  requestId: string; // RFQ/Request ID
  buyerId: string; // Buyer user ID
  sellerId: string; // Seller user ID
  lastMessageAt: string; // ISO timestamp of last message
  lastMessagePreview: string; // Preview text of last message (truncated)
  lastSenderRole?: "BUYER" | "SELLER" | "SYSTEM"; // Role of the last message sender
  isArchived?: boolean; // Whether the thread is archived
}

/**
 * Generate canonical threadId for a buyer-seller pair on an RFQ
 * Format: thread:rq=<requestId>|b=<buyerId>|s=<sellerId>
 * This is the SINGLE SOURCE OF TRUTH for threadId generation
 */
export function generateThreadId(requestId: string, buyerId: string, sellerId: string): string {
  return `thread:rq=${requestId}|b=${buyerId}|s=${sellerId}`;
}

/**
 * Parse threadId to extract components
 * Supports both canonical format (thread:rq=...) and legacy format (rq:...)
 * Safely handles falsy input (null, undefined, empty string) by returning null
 */
export function parseThreadId(threadId: string | null | undefined): { requestId: string; buyerId: string; sellerId: string } | null {
  // Safely handle falsy input
  if (!threadId || typeof threadId !== "string" || threadId.trim().length === 0) {
    return null;
  }
  
  // Try canonical format first: thread:rq=<requestId>|b=<buyerId>|s=<sellerId>
  let match = threadId.match(/^thread:rq=(.+)\|b=(.+)\|s=(.+)$/);
  if (match) {
    return {
      requestId: match[1],
      buyerId: match[2],
      sellerId: match[3],
    };
  }
  
  // Fallback to legacy format: rq:<rfqId>|b:<buyerId>|s:<sellerId>
  match = threadId.match(/^rq:(.+)\|b:(.+)\|s:(.+)$/);
  if (match) {
    return {
      requestId: match[1],
      buyerId: match[2],
      sellerId: match[3],
    };
  }
  
  return null;
}

/**
 * Normalize threadId to canonical format
 * Converts legacy format to canonical format if needed
 * Safely handles falsy input (null, undefined, empty string) by returning the original input or a safe fallback
 */
export function normalizeThreadId(threadId: string | null | undefined): string {
  // Safely handle falsy input - return original or safe fallback
  if (!threadId || typeof threadId !== "string" || threadId.trim().length === 0) {
    return threadId || "";
  }
  
  const parsed = parseThreadId(threadId);
  if (!parsed) {
    // Return original input instead of throwing (for backwards compatibility)
    return threadId;
  }
  return generateThreadId(parsed.requestId, parsed.buyerId, parsed.sellerId);
}

/**
 * Get messages for a specific thread
 * Normalizes threadId to canonical format for consistent lookup
 * 
 * @param threadId The thread ID (canonical or legacy format)
 * @param userId Optional user ID. If not provided, uses current authenticated user.
 * @returns Array of messages in the thread, sorted by createdAt ascending
 */
export function getThreadMessages(threadId: string, userId?: string): Message[] {
  // Guard against falsy threadId
  if (!threadId) {
    return [];
  }
  
  // Normalize threadId to canonical format
  const normalizedThreadId = normalizeThreadId(threadId);
  
  // Guard against invalid normalized threadId
  if (!normalizedThreadId || normalizedThreadId.length === 0) {
    return [];
  }
  
  // Get user ID - userId is required (no fallback to current user)
  if (!userId) {
    throw new Error("getThreadMessages: userId is required");
  }
  const targetUserId = userId;
  
  // TODO: Load messages from API when /api/*/messages/[rfqId] endpoint exists
  // For now, return empty array (messages are loaded via API in pages)
  const allMessages: Message[] = [];
  
  // Filter messages matching this thread (support both canonical and legacy formats)
  const threadMessages = allMessages
    .filter((m) => {
      // Guard against undefined/null threadId
      if (!m.threadId) return false;
      
      // Match canonical format
      if (m.threadId === normalizedThreadId) return true;
      // Match legacy format if threadId is in legacy format
      if (m.threadId === threadId) return true;
      // Normalize message's threadId and compare
      try {
        const normalized = normalizeThreadId(m.threadId);
        return normalized === normalizedThreadId && normalized.length > 0;
      } catch {
        return false;
      }
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (process.env.NODE_ENV === "development") {
    console.log("📨 GET_THREAD_MESSAGES", {
      threadId,
      normalizedThreadId,
      userId: targetUserId,
      messageCount: threadMessages.length,
    });
  }

  return threadMessages;
}

/**
 * Create a system message for a thread
 * System messages are generated by the platform for key events
 * 
 * @param threadId The thread ID (canonical or legacy format)
 * @param body The message body text
 * @param metadata Optional metadata (e.g., event type, related IDs)
 * @returns The created system message
 */
export function createSystemMessage(
  threadId: string,
  body: string,
  metadata?: Record<string, any>
): Message {
  // Guard against falsy threadId
  if (!threadId) {
    throw new Error("createSystemMessage: threadId is required");
  }
  
  const normalizedThreadId = normalizeThreadId(threadId);
  if (!normalizedThreadId || normalizedThreadId.length === 0) {
    throw new Error(`createSystemMessage: invalid threadId format: ${threadId}`);
  }
  
  const systemMessage: Message = {
    id: crypto.randomUUID(),
    threadId: normalizedThreadId,
    senderId: "system",
    senderRole: "SYSTEM",
    body,
    createdAt: new Date().toISOString(),
    readBy: [], // System messages start unread
    metadata,
    fromName: "System",
    // Legacy field - system messages don't use fromRole
  };
  
  // System messages are now created via API when events occur
  // This function is kept for backwards compatibility but does not persist
  // TODO: Replace with API call to /api/*/messages/[rfqId] POST endpoint
  
  return systemMessage;
}

/**
 * Save a message to both buyer's and seller's scoped storage
 * Normalizes threadId to canonical format and ensures message conforms to canonical schema
 * 
 * @param threadId The thread ID (canonical or legacy format)
 * @param message The message to save (threadId will be normalized/overridden)
 * @returns The saved canonical message
 */
export function saveMessage(threadId: string, message: Omit<Message, "threadId">): Message {
  // Validate required fields
  if (!message.senderId || !message.senderRole || !message.body || !message.createdAt) {
    throw new Error("Message validation failed: missing required fields (senderId, senderRole, body, createdAt)");
  }

  // Validate message body is not empty
  const trimmedBody = message.body.trim();
  if (trimmedBody.length === 0) {
    throw new Error("Message validation failed: message body cannot be empty");
  }

  // Validate message length (max 2000 characters)
  const MAX_MESSAGE_LENGTH = 2000;
  if (trimmedBody.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message validation failed: message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Normalize threadId to canonical format
  const normalizedThreadId = normalizeThreadId(threadId);
  
  // Parse threadId to extract components
  const parsed = parseThreadId(normalizedThreadId);
  if (!parsed) {
    throw new Error(`Message validation failed: invalid threadId format: ${threadId}`);
  }

  // Validate sender authorization: senderId must match buyerId or sellerId in threadId (or be "system")
  if (message.senderId !== "system") {
    if (message.senderId !== parsed.buyerId && message.senderId !== parsed.sellerId) {
      throw new Error(`Message validation failed: sender ${message.senderId} is not authorized to post to thread ${normalizedThreadId}`);
    }
  }

  // Validate buyer messages must have intent (Rule: structured messaging)
  if (message.senderRole === "BUYER" && message.senderId !== "system") {
    const intent = message.metadata?.intent as BuyerMessageIntent | undefined;
    if (!intent) {
      throw new Error("Message validation failed: buyer messages must include an intent in metadata.intent");
    }
    const validIntents: BuyerMessageIntent[] = [
      "REQUEST_UPDATE",
      "ASK_LEAD_TIME",
      "ASK_PRICE",
      "ASK_SUBSTITUTION",
      "CONFIRM_DETAILS",
      "CANCEL_REQUEST",
    ];
    if (!validIntents.includes(intent)) {
      throw new Error(`Message validation failed: invalid buyer message intent: ${intent}`);
    }
    // Validate optional text length (max 240 chars)
    const optionalText = message.metadata?.optionalText as string | undefined;
    if (optionalText && optionalText.length > 240) {
      throw new Error("Message validation failed: optional text exceeds maximum length of 240 characters");
    }
  }

  // Ensure readBy array exists
  const readBy = Array.isArray(message.readBy) ? message.readBy : [];

  // Normalize message to canonical format
  const canonicalMessage: Message = {
    id: message.id || crypto.randomUUID(),
    threadId: normalizedThreadId,
    senderId: message.senderId,
    senderRole: message.senderRole,
    body: trimmedBody, // Use trimmed body
    createdAt: message.createdAt,
    readBy,
    metadata: message.metadata,
    // Preserve legacy fields for backwards compatibility
    fromRole: message.fromRole || (message.senderRole !== "SYSTEM" ? message.senderRole : undefined),
    fromName: message.fromName,
    rfqId: message.rfqId || parsed.requestId,
    buyerId: message.buyerId || parsed.buyerId,
    sellerId: message.sellerId || parsed.sellerId,
    seenByBuyerAt: message.seenByBuyerAt,
    seenBySellerAt: message.seenBySellerAt,
  };

  if (process.env.NODE_ENV === "development") {
    console.log("💬 SAVE_MESSAGE", {
      threadId: canonicalMessage.threadId,
      requestId: parsed.requestId,
      buyerId: parsed.buyerId,
      sellerId: parsed.sellerId,
      senderRole: canonicalMessage.senderRole,
      senderId: canonicalMessage.senderId,
    });
  }

  // Messages are now saved via API in pages (POST /api/*/messages/[rfqId])
  // This function is kept for backwards compatibility but does not persist
  // TODO: Replace with API call to /api/*/messages/[rfqId] POST endpoint
  
  // If seller sent a message, mark dispatch record as responded (stops escalation)
  if (canonicalMessage.senderRole === "SELLER" && parsed.sellerId && parsed.sellerId !== "__unassigned__") {
    // TODO: Mark dispatch as responded via API when endpoint exists
    // For now, no-op
  }

  return canonicalMessage;
}

/**
 * Get all threads for a user (grouped by threadId)
 */
export function getUserThreads(_userId: string): Map<string, Message[]> {
  // TODO: Load messages from API when /api/*/messages endpoint exists
  // For now, return empty map (threads are loaded via API in pages)
  return new Map<string, Message[]>();
}

/**
 * Get unread message count for a specific thread
 * Uses canonical readBy array for accurate unread tracking
 * 
 * @param threadId The thread ID (canonical or legacy format)
 * @param userId The user ID to check unread count for
 * @returns Number of unread messages in the thread
 */
export function getUnreadCountForThread(threadId: string, userId: string): number {
  // Guard against falsy threadId
  if (!threadId) {
    return 0;
  }
  
  const normalizedThreadId = normalizeThreadId(threadId);
  if (!normalizedThreadId || normalizedThreadId.length === 0) {
    return 0;
  }
  
  const parsed = parseThreadId(normalizedThreadId);
  if (!parsed) {
    return 0;
  }

  // Determine user role from thread participants
  let userRole: "BUYER" | "SELLER";
  if (userId === parsed.buyerId) {
    userRole = "BUYER";
  } else if (userId === parsed.sellerId) {
    userRole = "SELLER";
  } else {
    // User is not a participant in this thread
    return 0;
  }

  const messages = getThreadMessages(threadId, userId);
  return messages.filter((m) => {
    // Check if message is from the opposite role
    const isFromOpposite = (userRole === "BUYER" && m.senderRole === "SELLER") || 
                           (userRole === "SELLER" && m.senderRole === "BUYER");
    
    if (!isFromOpposite) return false;
    
    // Use canonical readBy array if available
    if (Array.isArray(m.readBy)) {
      return !m.readBy.includes(userId);
    }
    
    // Fallback to legacy seenBy fields for backwards compatibility
    if (userRole === "BUYER") {
      return m.senderRole === "SELLER" && (m.seenByBuyerAt === null || m.seenByBuyerAt === undefined);
    } else {
      return m.senderRole === "BUYER" && (m.seenBySellerAt === null || m.seenBySellerAt === undefined);
    }
  }).length;
}

/**
 * Get total unread message count for a user across all threads
 * 
 * @param userId The user ID
 * @param role The user's role ("BUYER" | "SELLER")
 * @returns Total number of unread messages across all threads
 */
export function getUnreadCount(userId: string, role: "BUYER" | "SELLER"): number {
  const threads = listThreadsForUser(userId, role);
  let total = 0;
  
  for (const thread of threads) {
    total += getUnreadCountForThread(thread.threadId, userId);
  }
  
  return total;
}

/**
 * Mark messages in a thread as read for a specific user
 * Updates canonical readBy array and maintains legacy fields for backwards compatibility
 * 
 * @param threadId The thread ID (canonical or legacy format)
 * @param userId The user ID marking messages as read
 */
export function markThreadAsRead(threadId: string, userId: string): void {
  // Guard against falsy threadId
  if (!threadId) {
    return; // Silently ignore invalid threadId
  }
  
  const normalizedThreadId = normalizeThreadId(threadId);
  if (!normalizedThreadId || normalizedThreadId.length === 0) {
    return; // Silently ignore invalid threadId instead of throwing
  }
  
  const parsed = parseThreadId(normalizedThreadId);
  if (!parsed) {
    return; // Silently ignore invalid threadId instead of throwing
  }

  // Determine user role from thread participants (for validation only)
  let _userRole: "BUYER" | "SELLER";
  if (userId === parsed.buyerId) {
    _userRole = "BUYER";
  } else if (userId === parsed.sellerId) {
    _userRole = "SELLER";
  } else {
    throw new Error(`User ${userId} is not a participant in thread ${threadId}`);
  }

  // TODO: Mark messages as read via API when /api/*/messages/[rfqId] PATCH endpoint exists
  // For now, no-op (read state is managed via API in pages)
  // Removed all storage-based read marking - function is a no-op until API exists
}

/**
 * Get thread summary for a specific thread
 * Returns lightweight summary with last message info
 */
export function getThreadSummary(threadId: string, userId: string): ThreadSummary | null {
  // Guard against falsy threadId
  if (!threadId) return null;
  
  const messages = getThreadMessages(threadId, userId);
  if (messages.length === 0) return null;
  
  const parsed = parseThreadId(threadId);
  if (!parsed) return null;
  
  // Sort by createdAt descending to get last message
  const sortedMessages = [...messages].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const lastMessage = sortedMessages[0];
  
  // Truncate preview to 100 characters
  const preview = lastMessage.body.length > 100 
    ? lastMessage.body.substring(0, 100) + "..."
    : lastMessage.body;
  
  // Ensure threadId is in canonical format using generateThreadId
  // This guarantees the threadId is always in the correct format
  const canonicalThreadId = generateThreadId(parsed.requestId, parsed.buyerId, parsed.sellerId);
  
  return {
    threadId: canonicalThreadId,
    requestId: parsed.requestId,
    buyerId: parsed.buyerId,
    sellerId: parsed.sellerId,
    lastMessageAt: lastMessage.createdAt,
    lastMessagePreview: preview,
  };
}

/**
 * List all threads for a user, filtered by role
 * Returns thread summaries for all threads the user participates in
 * 
 * @param userId The user ID
 * @param role The user's role ("BUYER" | "SELLER")
 * @returns Array of thread summaries, sorted by lastMessageAt descending
 */
export function listThreadsForUser(userId: string, role: "BUYER" | "SELLER"): ThreadSummary[] {
  // TODO: Load threads from API when /api/*/messages endpoint exists
  // For now, return empty array (threads are loaded via API in pages)
  const allMessages: Message[] = [];
  
  // Filter out messages with invalid threadIds BEFORE processing to avoid errors
  const validMessages = allMessages.filter((m) => {
    // Only process messages with valid threadIds
    return m.threadId && typeof m.threadId === "string" && m.threadId.trim().length > 0;
  });
  
  const threadMap = new Map<string, Message[]>();
  
  // Group messages by threadId (normalized)
  // Also handle legacy messages without threadId by computing it from rfqId/buyerId/sellerId
  for (const message of validMessages) {
    try {
      // At this point, message.threadId is guaranteed to be a valid non-empty string
      let normalizedThreadId = normalizeThreadId(message.threadId!);
      if (!normalizedThreadId || normalizedThreadId.length === 0) {
        // Try to compute threadId from legacy fields if normalization fails
        if (message.rfqId && message.buyerId && message.sellerId) {
          normalizedThreadId = generateThreadId(message.rfqId, message.buyerId, message.sellerId);
        } else {
          continue; // Skip if we can't compute threadId
        }
      }
      if (!threadMap.has(normalizedThreadId)) {
        threadMap.set(normalizedThreadId, []);
      }
      threadMap.get(normalizedThreadId)!.push(message);
    } catch {
      // Skip invalid threadIds
      continue;
    }
  }
  
  // Generate summaries for each thread
  const summaries: ThreadSummary[] = [];
  for (const [threadId, messages] of threadMap.entries()) {
    try {
      const parsed = parseThreadId(threadId);
      if (!parsed) continue;
      
      // Verify user is a participant in this thread
      const isParticipant = (role === "BUYER" && userId === parsed.buyerId) ||
                           (role === "SELLER" && userId === parsed.sellerId);
      if (!isParticipant) continue;
      
      // Sort by createdAt descending to get last message
      const sortedMessages = [...messages].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const lastMessage = sortedMessages[0];
      
      // Truncate preview to 100 characters
      const preview = lastMessage.body.length > 100 
        ? lastMessage.body.substring(0, 100) + "..."
        : lastMessage.body;
      
      // Ensure threadId is in canonical format using generateThreadId
      const canonicalThreadId = generateThreadId(parsed.requestId, parsed.buyerId, parsed.sellerId);
      
      summaries.push({
        threadId: canonicalThreadId,
        requestId: parsed.requestId,
        buyerId: parsed.buyerId,
        sellerId: parsed.sellerId,
        lastMessageAt: lastMessage.createdAt,
        lastMessagePreview: preview,
        lastSenderRole: lastMessage.senderRole,
        isArchived: false, // Default to not archived (can be extended later)
      });
    } catch {
      // Skip invalid threadIds
      continue;
    }
  }
  
  // Sort by lastMessageAt descending
  return summaries.sort((a, b) => 
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

/**
 * Get active threads for a user
 * Active means: thread is not archived AND (RFQ is not closed OR lastMessageAt is within the last 14 days)
 * 
 * @param userId The user ID
 * @param role The user's role ("BUYER" | "SELLER")
 * @param rfqs Optional array of RFQs to check status (if not provided, uses lastMessageAt within 14 days)
 * @returns Array of active thread summaries
 */
export function getActiveThreadsForUser(
  userId: string,
  role: "BUYER" | "SELLER",
  rfqs?: Array<{ id: string; status: string }>
): ThreadSummary[] {
  const allThreads = listThreadsForUser(userId, role);
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  return allThreads.filter((thread) => {
    // Filter out archived threads
    if (thread.isArchived) {
      return false;
    }

    // If we have RFQ data, check if RFQ is closed
    if (rfqs) {
      const rfq = rfqs.find((r) => r.id === thread.requestId);
      if (rfq) {
        // If RFQ is closed, check if lastMessageAt is within 14 days
        if (rfq.status === "CLOSED" || rfq.status === "AWARDED") {
          const lastMessageDate = new Date(thread.lastMessageAt);
          return lastMessageDate >= fourteenDaysAgo;
        }
        // If RFQ is open, thread is active
        return true;
      }
    }

    // If no RFQ data, use lastMessageAt within 14 days as the active rule
    const lastMessageDate = new Date(thread.lastMessageAt);
    return lastMessageDate >= fourteenDaysAgo;
  });
}

/**
 * Get threads that need a reply (last message was from the other party)
 * 
 * @param userId The user ID
 * @param role The user's role ("BUYER" | "SELLER")
 * @returns Array of thread summaries that need a reply
 */
export function getThreadsNeedingReply(
  userId: string,
  role: "BUYER" | "SELLER"
): ThreadSummary[] {
  const allThreads = listThreadsForUser(userId, role);
  
  return allThreads.filter((thread) => {
    // Thread needs reply if last message was from the other party
    if (role === "SELLER") {
      return thread.lastSenderRole === "BUYER";
    } else {
      return thread.lastSenderRole === "SELLER";
    }
  });
}

/**
 * Get all thread summaries for a user (legacy function, use listThreadsForUser instead)
 * @deprecated Use listThreadsForUser(userId, role) instead
 * 
 * This function now requires an explicit role parameter and simply calls listThreadsForUser.
 * No auth imports, no inference, no dynamic imports.
 */
export function getAllThreadSummaries(userId: string, role: "BUYER" | "SELLER"): ThreadSummary[] {
  return listThreadsForUser(userId, role);
}

/**
 * Migrate legacy messages (keyed by rfqId only) to thread-based storage
 * This is a one-time migration that runs on first access
 */
export function migrateLegacyMessages(): void {
  // Removed localStorage migration flag - messages are now stored in database via API
  // Migration is no longer needed
  return;
}

