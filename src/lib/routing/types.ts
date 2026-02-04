/**
 * Routing Types - Single source of truth for routing decisions
 * 
 * BANNED: normalizeCategory, CANONICAL_CATEGORIES, require(), saveRfqs, RFQS_KEY, getRfqs, generateRFQNumber
 * Routing MUST use CategoryId only. Category labels are display-only.
 */

import type { CategoryId } from "@/lib/categoryIds";

// LEGACY DISPLAY ONLY — do not use for routing logic
export type Category = 
  | "HVAC" 
  | "Plumbing" 
  | "Electrical" 
  | "Roofing" 
  | "Lumber" 
  | "Siding"
  | "Drywall"
  | "Insulation"
  | "Windows & Doors"
  | "Concrete & Masonry"
  | "Paint"
  | "Other";

export type FulfillmentType = "PICKUP" | "DELIVERY";

export type RoutingStrategy = 
  | "broadcast_category"  // Broadcast to all eligible suppliers in category
  | "preferred_first"      // Route to preferred supplier(s) first, fallback to broadcast
  | "fastest_first";       // Route to fastest available suppliers

export interface Supplier {
  id: string;
  name?: string;
  categories: Category[]; // Legacy: display labels
  categoryIds: string[]; // NEW: canonical IDs (e.g., ["roofing", "hvac"])
  isActive: boolean;
  isVerified: boolean;
  serviceAreas?: string[]; // Placeholder for future geo-matching
  supportsDelivery: boolean;
  supportsPickup: boolean;
  slaMinutes?: number | null; // Response time SLA in minutes (null = unknown)
  capacityPaused?: boolean; // Optional: if true, supplier is at capacity
}

export interface BuyerProfile {
  id: string;
  preferredSuppliersByCategory: Record<CategoryId, string[]>; // Map category to list of preferred supplier IDs
  excludedSuppliers?: string[]; // Supplier IDs to exclude
  defaultStrategyByCategory?: Record<CategoryId, "best_price" | "fastest" | "preferred">;
}

export type RouteMode = "preferred_only" | "category_broadcast";

export interface RoutingPlan {
  strategy: RoutingStrategy;
  routeMode: RouteMode; // V1 FIX: Enforce routing mode (preferred_only vs category_broadcast)
  targets: string[]; // Supplier IDs to send to (empty for broadcast_category until dispatch time)
  explainInternal: {
    reason: string;
    eligibleCount?: number;
    preferredCount?: number;
    fallbackReason?: string;
    eligibilityDebug?: {
      totalInCategory: number;
      activeCount: number;
      matchesFulfillment: number;
      matchesServiceArea: number;
      preferredConfigured: number;
      preferredEligible: number;
      failedBreakdown?: {
        inactive: number;
        notVerified: number;
        missingFulfillment: number;
        excluded: number;
        capacityPaused: number;
        supplierIds?: {
          inactive: string[];
          notVerified: string[];
          missingFulfillment: string[];
          excluded: string[];
          capacityPaused: string[];
        };
      };
    };
  };
}

export interface DraftRFQ {
  id?: string;
  title?: string;
  category?: Category; // Legacy: display label
  categoryId?: string; // NEW: canonical ID (e.g., "roofing") - preferred
  fulfillmentType?: FulfillmentType;
  requestedDate?: string; // ISO date string
  location?: string;
  priority?: "fastest" | "best_price" | "preferred" | "not_sure";
  notes?: string;
  jobNameOrPo?: string;
  lineItems?: Array<{
    description: string;
    unit: string;
    quantity: number;
  }>;
}

