/**
 * Event Log (Layer 7: Analytics + Memory)
 * Append-only event log for tracking key actions in the system
 */


/**
 * Event types
 */
export type EventType =
  | "REQUEST_POSTED"
  | "DISPATCH_SENT"
  | "SUPPLIER_RESPONDED"
  | "BID_SUBMITTED"
  | "ORDER_AWARDED"
  | "ORDER_CONFIRMED"
  | "ORDER_SCHEDULED"
  | "ORDER_DELIVERED"
  | "ORDER_PICKED_UP"
  | "ORDER_CANCELLED";

/**
 * Event log entry
 */
export interface EventLogEntry {
  id: string; // UUID
  type: EventType;
  at: string; // ISO timestamp
  requestId?: string; // Related request ID (preferred when available)
  orderId?: string; // Related order ID
  buyerId?: string; // Actor or related buyer ID
  sellerId?: string; // Actor or related seller ID
  metadata?: Record<string, any>; // Additional context (totalPrice, leadTimeDays, phase, etc.)
}

/**
 * Storage key for event log
 * TODO: Event log is now stored in database via API
 */
// const EVENT_LOG_KEY = "eventLog"; // Removed - no longer using storage

/**
 * Get all events from storage
 */
function getAllEvents(): EventLogEntry[] {
  // TODO: Replace with API call or DB query
  return [];
}

/**
 * Save events to storage
 */
function saveEvents(_events: EventLogEntry[]): void {
  // TODO: Replace with API call or DB write
  // Event log is now stored in database via API
}

/**
 * Log an event to the append-only event log
 * 
 * @param event Event data (id and at will be auto-generated if not provided)
 * @returns The logged event entry
 */
export function logEvent(event: Omit<EventLogEntry, "id" | "at"> & Partial<Pick<EventLogEntry, "id" | "at">>): EventLogEntry {
  const events = getAllEvents();
  
  const eventEntry: EventLogEntry = {
    id: event.id || crypto.randomUUID(),
    type: event.type,
    at: event.at || new Date().toISOString(),
    requestId: event.requestId,
    orderId: event.orderId,
    buyerId: event.buyerId,
    sellerId: event.sellerId,
    metadata: event.metadata,
  };
  
  // Append to log (append-only)
  events.push(eventEntry);
  saveEvents(events);
  
  if (process.env.NODE_ENV === "development") {
    console.log("📊 EVENT_LOG", {
      type: eventEntry.type,
      requestId: eventEntry.requestId,
      orderId: eventEntry.orderId,
      at: eventEntry.at,
    });
  }
  
  return eventEntry;
}

/**
 * List events for a specific request
 * 
 * @param requestId Request ID
 * @returns Array of events related to the request
 */
export function listEventsByRequest(requestId: string): EventLogEntry[] {
  if (!requestId) {
    return [];
  }
  
  const events = getAllEvents();
  return events.filter((e) => e.requestId === requestId);
}

/**
 * List events for a specific seller
 * 
 * @param sellerId Seller ID
 * @param since Optional ISO timestamp to filter events after this time
 * @returns Array of events related to the seller
 */
export function listEventsBySeller(sellerId: string, since?: string): EventLogEntry[] {
  if (!sellerId) {
    return [];
  }
  
  const events = getAllEvents();
  let filtered = events.filter((e) => e.sellerId === sellerId);
  
  if (since) {
    const sinceDate = new Date(since);
    filtered = filtered.filter((e) => new Date(e.at) >= sinceDate);
  }
  
  return filtered;
}

/**
 * List events for a specific buyer
 * 
 * @param buyerId Buyer ID
 * @param since Optional ISO timestamp to filter events after this time
 * @returns Array of events related to the buyer
 */
export function listEventsByBuyer(buyerId: string, since?: string): EventLogEntry[] {
  if (!buyerId) {
    return [];
  }
  
  const events = getAllEvents();
  let filtered = events.filter((e) => e.buyerId === buyerId);
  
  if (since) {
    const sinceDate = new Date(since);
    filtered = filtered.filter((e) => new Date(e.at) >= sinceDate);
  }
  
  return filtered;
}

