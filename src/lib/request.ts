/**
 * Canonical Request model for Layer 2 (Order Capture + Normalization)
 * 
 * API-backed: All data comes from /api/buyer/rfqs and /api/seller/rfqs endpoints.
 * NO localStorage, NO storage keys, NO rfqCompat.
 * 
 * This module provides type definitions and conversion utilities.
 * Actual data fetching is done via API calls.
 */

/**
 * Request status lifecycle
 */
export type RequestStatus = 
  | "draft"      // Buyer is still editing
  | "posted"     // Published to sellers (equivalent to "OPEN")
  | "quoting"    // Sellers are submitting bids
  | "awarded"    // Buyer selected a winner
  | "ordered"    // PO generated, order placed
  | "closed";    // Request closed (no award or completed)

/**
 * Review status (tracks buyer message review state)
 */
export type ReviewStatus = 
  | "pending_review";  // Buyer has sent a message, supplier review pending (no response required)

/**
 * Delivery mode
 */
export type DeliveryMode = "delivery" | "pickup";

/**
 * Delivery terms (discriminated union based on mode)
 */
export interface DeliveryTerms {
  mode: DeliveryMode;
  needBy: string; // ISO datetime or date string
  
  // If mode === "delivery"
  address?: string; // Complete delivery address
  
  // If mode === "pickup"
  pickupWindow?: string; // Description of pickup window/location
}

/**
 * Request item (line item)
 */
export interface RequestItem {
  id: string; // Unique ID for this item within the request
  description: string; // Free text description
  category: string; // Material category (e.g., "Roofing", "Electrical", "Lumber") or "unknown"
  quantity: number; // Quantity (must be > 0)
  unit: string; // Unit of measure: "ea", "sq", "bundle", "lf", "sf", "sy", "cy", "lb", "ton", "gal", "bag", "box", "roll", etc.
  
  // Optional fields
  sku?: string; // SKU/part number
  brand?: string; // Preferred brand
  specs?: string | Record<string, any>; // Specifications (string or object)
  allowAlternates?: boolean; // Whether seller can propose alternatives
}

/**
 * Canonical Request model (renamed from Request to avoid conflict with DOM Request type)
 */
export interface RFQRequest {
  id: string; // UUID
  buyerId: string; // Required buyer ID
  status: RequestStatus;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  
  // Optional fields
  jobName?: string; // Job/project name (replaces "title")
  notes?: string; // General notes/description
  substitutionsAllowed?: boolean; // Whether substitutions are allowed across all items
  reviewStatus?: ReviewStatus; // Review status (set when buyer sends message, cleared when supplier responds)
  attachments?: Array<{ // Stub for future file attachments
    id: string;
    name: string;
    url?: string;
    type?: string;
  }>;
  
  // Required fields
  delivery: DeliveryTerms; // Delivery/pickup terms
  items: RequestItem[]; // Array of request items (must have at least one)
}

/**
 * Input type for creating a new draft request
 */
export interface CreateDraftRequestInput {
  buyerId: string;
  jobName?: string;
  notes?: string;
  substitutionsAllowed?: boolean;
  delivery: DeliveryTerms;
  items: Omit<RequestItem, "id">[]; // Items without IDs (will be generated)
  attachments?: Array<{ // Optional attachments
    id: string;
    name: string;
    url?: string;
    type?: string;
  }>;
}

/**
 * Input type for updating a draft request
 */
export interface UpdateDraftRequestInput {
  jobName?: string;
  notes?: string;
  substitutionsAllowed?: boolean;
  delivery?: DeliveryTerms;
  items?: Omit<RequestItem, "id">[]; // Items without IDs (will be generated)
}

/**
 * Generate a unique ID for a request item
 */
function generateItemId(): string {
  return `item-${crypto.randomUUID()}`;
}

/**
 * Create a new draft request (pure function - no persistence)
 * Caller must persist via POST /api/buyer/rfqs
 * 
 * @param input Request input data
 * @returns The created Request object (in-memory only)
 */
export function createDraftRequest(input: CreateDraftRequestInput): RFQRequest {
  const now = new Date().toISOString();
  
  // Validate required fields
  if (!input.buyerId) {
    throw new Error("createDraftRequest: buyerId is required");
  }
  if (!input.delivery) {
    throw new Error("createDraftRequest: delivery is required");
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("createDraftRequest: at least one item is required");
  }
  
  // Validate delivery terms
  if (input.delivery.mode === "delivery" && !input.delivery.address) {
    throw new Error("createDraftRequest: address is required for delivery mode");
  }
  if (input.delivery.mode === "pickup" && !input.delivery.pickupWindow) {
    throw new Error("createDraftRequest: pickupWindow is required for pickup mode");
  }
  
  // Normalize and validate items
  const normalizedItems = input.items.map((item) => normalizeRequestItem(item));
  
  // Generate IDs for items
  const items: RequestItem[] = normalizedItems.map((item) => ({
    ...item,
    id: generateItemId(),
  }));
  
  // Normalize delivery terms
  const normalizedDelivery = normalizeDeliveryTerms(input.delivery);
  
  // Create request (normalize text fields)
  const request: RFQRequest = {
    id: crypto.randomUUID(),
    buyerId: input.buyerId.trim(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    jobName: input.jobName?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    substitutionsAllowed: input.substitutionsAllowed ?? false,
    delivery: normalizedDelivery,
    items,
    attachments: input.attachments || [],
  };
  
  return request;
}

/**
 * Get a request by ID from API
 * 
 * @param requestId Request ID
 * @param buyerId Optional buyer ID (for buyer context, uses /api/buyer/rfqs/[id])
 * @param sellerId Optional seller ID (for seller context, uses /api/seller/rfqs/[id])
 * @returns Request if found, null otherwise
 */
export async function getRequest(
  requestId: string,
  buyerId?: string,
  sellerId?: string
): Promise<RFQRequest | null> {
  if (!requestId) {
    return null;
  }

  // Determine API endpoint based on context
  let apiUrl: string;
  if (buyerId) {
    apiUrl = `/api/buyer/rfqs/${requestId}`;
  } else if (sellerId) {
    apiUrl = `/api/seller/rfqs/${requestId}`;
  } else {
    // Default to buyer endpoint if no context provided
    apiUrl = `/api/buyer/rfqs/${requestId}`;
  }

  try {
    const response = await fetch(apiUrl, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      // For other errors, log and return null
      if (process.env.NODE_ENV === "development") {
        console.error(`[GET_REQUEST_FAILED]`, {
          requestId,
          status: response.status,
          url: apiUrl,
        });
      }
      return null;
    }

    const data = await response.json();
    const rfq = data?.data || data;

    // Convert RFQ to Request format
    return rfqToRequest(rfq);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[GET_REQUEST_ERROR]`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        url: apiUrl,
      });
    }
    return null;
  }
}

/**
 * List all requests for a buyer from API
 * 
 * @param buyerId Buyer ID
 * @param filters Optional filters (status, etc.)
 * @returns Array of requests
 */
export async function listRequestsForBuyer(
  buyerId: string,
  filters?: {
    status?: RequestStatus | RequestStatus[];
  }
): Promise<RFQRequest[]> {
  if (!buyerId) {
    return [];
  }

  try {
    const response = await fetch("/api/buyer/rfqs", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error(`[LIST_REQUESTS_FAILED]`, {
          buyerId,
          status: response.status,
        });
      }
      return [];
    }

    const data = await response.json();
    const rfqs = Array.isArray(data) ? data : (data?.data || []);

    // Convert RFQs to Request format
    let requests = rfqs.map((rfq: any) => rfqToRequest(rfq));

    // Apply filters
    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      requests = requests.filter((r) => statuses.includes(r.status));
    }

    // Sort by updatedAt descending (most recent first)
    requests.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return requests;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[LIST_REQUESTS_ERROR]`, {
        buyerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return [];
  }
}

/**
 * Convert RFQ (from API) to Request format
 * Helper function for API-backed conversion
 * Exported for use in pages that already have RFQ data
 */
export function rfqToRequest(rfq: any): RFQRequest {
  // Map RFQ status to Request status
  const statusMap: Record<string, RequestStatus> = {
    DRAFT: "draft",
    OPEN: "posted",
    PUBLISHED: "posted",
    AWARDED: "awarded",
    CLOSED: "closed",
  };

  // Convert delivery terms
  const delivery: DeliveryTerms = {
    mode: (rfq.terms?.fulfillmentType || "PICKUP").toLowerCase() as "delivery" | "pickup",
    needBy: rfq.terms?.requestedDate || rfq.createdAt,
    ...(rfq.terms?.fulfillmentType === "DELIVERY" && rfq.terms?.location && {
      address: rfq.terms.location,
    }),
    ...(rfq.terms?.fulfillmentType === "PICKUP" && rfq.terms?.pickupWindow && {
      pickupWindow: rfq.terms.pickupWindow,
    }),
  };

  // Convert line items
  const items: RequestItem[] = (rfq.lineItems || []).map((item: any, index: number) => ({
    id: item.id || `item-${rfq.id}-${index}`,
    description: item.description || "",
    category: rfq.category || rfq.categoryId || "unknown",
    quantity: item.quantity || 0,
    unit: (item.unit || "ea").toLowerCase(),
    sku: item.sku,
    brand: item.brand,
    specs: item.specs,
    allowAlternates: item.allowAlternates,
  }));

  // Build Request
  const request: RFQRequest = {
    id: rfq.id,
    buyerId: rfq.buyerId || "",
    status: statusMap[rfq.status] || "posted",
    createdAt: rfq.createdAt || new Date().toISOString(),
    updatedAt: rfq.awardedAt || rfq.updatedAt || rfq.createdAt || new Date().toISOString(),
    jobName: rfq.title || rfq.jobNameOrPo,
    notes: rfq.notes || undefined,
    substitutionsAllowed: false,
    delivery,
    items,
  };

  return request;
}

/**
 * Normalize a request item
 * - Trim whitespace on text fields
 * - Coerce quantity to number; reject NaN or <=0
 * - Default unit to "ea" if blank
 * - Normalize unit casing (lowercase)
 */
function normalizeRequestItem(item: Omit<RequestItem, "id">): Omit<RequestItem, "id"> {
  // Trim text fields
  const description = item.description.trim();
  const category = (item.category || "unknown").trim();
  const unit = (item.unit || "ea").trim().toLowerCase();
  const sku = item.sku?.trim();
  const brand = item.brand?.trim();
  
  // Coerce quantity to number
  let quantity: number;
  if (typeof item.quantity === "string") {
    quantity = parseFloat(item.quantity);
  } else {
    quantity = Number(item.quantity);
  }
  
  // Reject NaN or <=0
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error(`Invalid quantity: ${item.quantity}. Must be a positive number.`);
  }
  
  return {
    description,
    category: category || "unknown",
    quantity,
    unit: unit || "ea",
    sku: sku || undefined,
    brand: brand || undefined,
    specs: item.specs,
    allowAlternates: item.allowAlternates,
  };
}

/**
 * Set review status for a request
 * NOTE: This function is deprecated. Review status should be managed via API.
 * 
 * @param requestId Request ID
 * @param reviewStatus Review status to set (or undefined to clear)
 * @returns The updated Request, or null if not found
 * @deprecated Use API endpoint to update request review status
 */
export async function setRequestReviewStatus(
  requestId: string,
  reviewStatus: ReviewStatus | undefined
): Promise<RFQRequest | null> {
  // TODO: Implement via API endpoint if needed
  // For now, return null (review status should be managed server-side)
  if (process.env.NODE_ENV === "development") {
    console.warn("[SET_REQUEST_REVIEW_STATUS_DEPRECATED]", {
      requestId,
      reviewStatus,
      message: "Review status should be managed via API endpoint",
    });
  }
  return null;
}

/**
 * Normalize delivery terms
 * - Trim whitespace on text fields
 * - Validate mode-specific fields
 */
function normalizeDeliveryTerms(terms: DeliveryTerms): DeliveryTerms {
  const mode = terms.mode;
  const needBy = terms.needBy.trim();
  
  if (!needBy) {
    throw new Error("needBy is required");
  }
  
  if (mode === "delivery") {
    const address = terms.address?.trim();
    if (!address) {
      throw new Error("address is required for delivery mode");
    }
    return {
      mode: "delivery",
      needBy,
      address,
    };
  } else if (mode === "pickup") {
    // For pickup mode, needBy (pickup date) is sufficient
    // pickupWindow is optional (for future use if needed)
    const pickupWindow = terms.pickupWindow?.trim();
    return {
      mode: "pickup",
      needBy,
      ...(pickupWindow && { pickupWindow }),
    };
  } else {
    throw new Error(`Invalid delivery mode: ${mode}`);
  }
}

/**
 * Validation result for request drafts
 */
export interface RequestValidationResult {
  isValid: boolean;
  missingFields: string[];
}

/**
 * Validate quote-critical fields for posting
 * Returns validation result with human-readable missing fields
 * Only checks fields required for sellers to quote
 */
export function validateRequestDraft(request: RFQRequest): RequestValidationResult {
  const missingFields: string[] = [];
  
  // Validate buyerId
  if (!request.buyerId || request.buyerId.trim().length === 0) {
    missingFields.push("Buyer ID");
  }
  
  // Validate items (quote-critical: description, quantity, unit)
  if (!request.items || request.items.length === 0) {
    missingFields.push("At least one item");
  } else {
    request.items.forEach((item, index) => {
      if (!item.description || item.description.trim().length === 0) {
        missingFields.push(`Item ${index + 1}: Description`);
      }
      if (!item.quantity || item.quantity <= 0 || isNaN(item.quantity)) {
        missingFields.push(`Item ${index + 1}: Quantity (must be greater than 0)`);
      }
      if (!item.unit || item.unit.trim().length === 0) {
        missingFields.push(`Item ${index + 1}: Unit`);
      }
      // Category is optional but recommended (can be "unknown")
      // Not included in quote-critical checks
    });
  }
  
  // Validate delivery terms (quote-critical)
  if (!request.delivery) {
    missingFields.push("Delivery terms");
  } else {
    if (!request.delivery.needBy || request.delivery.needBy.trim().length === 0) {
      // Use mode-specific message for better UX
      if (request.delivery.mode === "pickup") {
        missingFields.push("Pickup date");
      } else {
        missingFields.push("Need-by date/time");
      }
    }
    
    if (request.delivery.mode === "delivery") {
      if (!request.delivery.address || request.delivery.address.trim().length === 0) {
        missingFields.push("Delivery address");
      }
    } else if (request.delivery.mode === "pickup") {
      // For pickup mode, needBy (pickup date) is sufficient - no separate pickupWindow required
      // The needBy field is already validated above, so no additional validation needed here
    } else {
      missingFields.push("Valid delivery mode (delivery or pickup)");
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
