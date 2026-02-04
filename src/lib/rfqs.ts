"use client";

/**
 * Centralized RFQ management utilities
 * Handles reading, saving, and deleting RFQs with cascade deletion
 */

import { getCurrentUser } from "./auth/client";
// Removed storage imports - RFQs are now stored in database via API
import { generateThreadId, parseThreadId } from "./messages";

export interface RFQ {
  id: string;
  rfqNumber: string;
  status: "OPEN" | "AWARDED" | "CLOSED" | "DRAFT";
  createdAt: string;
  title: string;
  notes: string;
  category: string; // Display label (e.g., "Roofing")
  categoryId?: string; // Canonical category ID (e.g., "roofing")
  buyerId?: string;
  jobNameOrPo?: string; // Job name or PO number for organization
  // V1 FIX: RFQ visibility model for preferred/direct vs broadcast
  visibility?: "broadcast" | "direct"; // "broadcast" = reverse auction (public feed), "direct" = targeted to specific suppliers
  targetSupplierIds?: string[]; // For direct visibility: list of supplier IDs this RFQ is targeted to
  lineItems: Array<{
    description: string;
    unit: string;
    quantity: number;
  }>;
  terms: {
    fulfillmentType: "PICKUP" | "DELIVERY";
    requestedDate: string;
    deliveryPreference?: "MORNING" | "ANYTIME";
    deliveryInstructions?: string;
    location?: string;
  };
  awardedBidId?: string;
  awardedAt?: string;
}

interface Bid {
  id: string;
  rfqId: string;
  sellerId?: string;
  [key: string]: any;
}

interface Message {
  id: string;
  threadId: string;
  rfqId?: string; // Legacy field
  [key: string]: any;
}

interface PO {
  id: string;
  rfqId: string;
  [key: string]: any;
}

interface Notification {
  id: string;
  ctaHref?: string;
  [key: string]: any;
}

// RFQ number generation is handled server-side in /api/buyer/rfqs POST endpoint
// Client should not generate RFQ numbers - API is source of truth

// RFQ storage is handled via API - no client-side storage functions

// RFQ deletion is handled via API - DELETE /api/buyer/rfqs/[id]
// Client should call API endpoint directly, not use this function

