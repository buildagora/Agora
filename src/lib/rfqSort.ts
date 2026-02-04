/**
 * Smart RFQ sorting utility
 * Provides consistent ordering across all RFQ lists
 */

export interface NormalizedRFQ {
  id: string;
  rfqNumber: string;
  status: "OPEN" | "AWARDED" | "CLOSED" | "EXPIRED";
  createdAt: string; // ISO string, always present after normalization
  dueAt?: string; // ISO string, parsed from terms.requestedDate or dueDate
  category: string;
  title: string;
  [key: string]: any; // Allow other RFQ fields
}

/**
 * Parse due date from RFQ
 * Handles terms.requestedDate, dueAt, or dueDate fields
 */
export function parseDueAt(rfq: any): string | undefined {
  // Try dueAt first
  if (rfq.dueAt) {
    return rfq.dueAt;
  }
  
  // Try dueDate
  if (rfq.dueDate) {
    return rfq.dueDate;
  }
  
  // Try terms.requestedDate (most common in current RFQ format)
  if (rfq.terms?.requestedDate) {
    return rfq.terms.requestedDate;
  }
  
  return undefined;
}

/**
 * Check if a due date is within the next 24 hours
 */
export function isClosingSoon(dueAt: string | undefined, now: Date): boolean {
  if (!dueAt) return false;
  
  try {
    const dueDate = new Date(dueAt);
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilDue > 0 && hoursUntilDue <= 24;
  } catch {
    return false;
  }
}

/**
 * Check if status is considered "open" (active, not closed)
 */
export function isOpen(status: string | undefined): boolean {
  return status === "OPEN" || !status;
}

/**
 * Check if status is considered "closed" (awarded, closed, expired)
 */
export function isClosed(status: string | undefined): boolean {
  return status === "AWARDED" || status === "CLOSED" || status === "EXPIRED";
}

/**
 * Normalize RFQ data - backfill missing fields and infer status
 */
export function normalizeRfq(rfq: any): NormalizedRFQ {
  // Backfill createdAt
  let createdAt = rfq.createdAt;
  if (!createdAt) {
    createdAt = rfq.updatedAt || "1970-01-01T00:00:00.000Z";
  }
  
  // Parse dueAt
  const dueAt = parseDueAt(rfq);
  
  // Infer status if missing
  let status: "OPEN" | "AWARDED" | "CLOSED" | "EXPIRED" = rfq.status || "OPEN";
  
  if (!rfq.status) {
    // If awardedBidId or awardedAt exists, it's awarded
    if (rfq.awardedBidId || rfq.awardedAt) {
      status = "AWARDED";
    } else if (dueAt) {
      // Check if due date is in the past
      try {
        const dueDate = new Date(dueAt);
        const now = new Date();
        if (dueDate < now) {
          status = "EXPIRED";
        }
      } catch {
        // Invalid date, keep as OPEN
      }
    }
    // Otherwise defaults to OPEN
  }
  
  // Normalize status to uppercase
  const normalizedStatus = status.toUpperCase() as "OPEN" | "AWARDED" | "CLOSED" | "EXPIRED";
  
  // Ensure lineItems is always an array (parse from JSON string if needed, or default to empty array)
  let lineItems = rfq.lineItems;
  if (!lineItems) {
    lineItems = [];
  } else if (typeof lineItems === "string") {
    try {
      lineItems = JSON.parse(lineItems);
    } catch {
      lineItems = [];
    }
  } else if (!Array.isArray(lineItems)) {
    lineItems = [];
  }
  
  return {
    ...rfq,
    createdAt,
    dueAt,
    status: normalizedStatus,
    lineItems, // Ensure lineItems is always an array
  };
}

/**
 * Get sort priority for RFQ grouping
 * Returns a number where lower = higher priority (appears first)
 */
function getSortPriority(rfq: NormalizedRFQ, now: Date): number {
  // Priority 1: Closing soon (due within 24h) - highest priority
  if (isOpen(rfq.status) && rfq.dueAt && isClosingSoon(rfq.dueAt, now)) {
    return 1;
  }
  
  // Priority 2: Open/Active (not closing soon, not closed)
  if (isOpen(rfq.status)) {
    return 2;
  }
  
  // Priority 3: Closed/Awarded/Expired - lowest priority (appears at bottom)
  if (isClosed(rfq.status)) {
    return 3;
  }
  
  // Fallback
  return 4;
}

/**
 * Smart sort RFQs according to business rules
 * Returns a NEW array (does not mutate input)
 * 
 * Sort order:
 * 1. Closing soon (due within 24h) - sorted by dueAt ASC, then createdAt DESC
 * 2. Open/Active - sorted by createdAt DESC (newest first)
 * 3. Closed/Awarded/Expired - sorted by createdAt DESC (newest first)
 */
export function smartSortRfqs(rfqs: any[], now: Date = new Date()): NormalizedRFQ[] {
  // Normalize all RFQs
  const normalized = rfqs.map(normalizeRfq);
  
  // Create a copy and sort
  const sorted = [...normalized].sort((a, b) => {
    const priorityA = getSortPriority(a, now);
    const priorityB = getSortPriority(b, now);
    
    // First, sort by priority group
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Within the same priority group:
    
    // For "closing soon" group (priority 1), sort by dueAt ASC, then createdAt DESC
    if (priorityA === 1) {
      if (a.dueAt && b.dueAt) {
        const dueA = new Date(a.dueAt).getTime();
        const dueB = new Date(b.dueAt).getTime();
        if (dueA !== dueB) {
          return dueA - dueB; // Soonest due first
        }
      } else if (a.dueAt && !b.dueAt) {
        return -1; // a has due date, b doesn't - a comes first
      } else if (!a.dueAt && b.dueAt) {
        return 1; // b has due date, a doesn't - b comes first
      }
      // Both have dueAt or both don't, fall through to createdAt sort
    }
    
    // For all groups, secondary sort by createdAt DESC (newest first)
    const createdA = new Date(a.createdAt).getTime();
    const createdB = new Date(b.createdAt).getTime();
    return createdB - createdA; // Newest first
  });
  
  return sorted;
}



