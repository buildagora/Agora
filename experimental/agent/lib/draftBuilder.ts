/**
 * Agora Agent V1 - Draft RFQ Builder
 * Builds draft RFQ objects from detected intent
 */

import { MATERIAL_CATEGORIES } from "@/lib/categoryDisplay";

export interface DraftRFQ {
  id: string;
  status: "draft";
  title: string;
  category: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  requestedDate: string;
  location?: string;
  lineItems: Array<{
    description: string;
    unit: string;
    quantity: number;
  }>;
  notes?: string;
  jobNameOrPo?: string; // Job name or PO number for organization
  urgency?: "urgent" | "normal" | "flexible";
  createdAt: string;
  updatedAt: string;
}

/**
 * Build a draft RFQ from intent
 */
interface DetectedIntent {
  category?: string;
  lineItems?: Array<{
    description?: string;
    unit?: string;
    quantity?: number;
  }>;
  neededDate?: string;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  location?: string;
  notes?: string;
  urgency?: "urgent" | "normal" | "flexible";
}

export function buildDraftFromIntent(intent: DetectedIntent, _buyerId: string): Partial<DraftRFQ> {
  const now = new Date().toISOString();
  
  // Generate title from category and line items
  let title = intent.category || "Material Request";
  if (intent.lineItems && intent.lineItems.length > 0) {
    const firstItem = intent.lineItems[0];
    if (firstItem.description) {
      title = `${intent.category || "Materials"}: ${firstItem.description}`;
    }
  }

  // Parse requested date
  let requestedDate = "";
  if (intent.neededDate) {
    // Try to parse common date formats
    const dateStr = intent.neededDate.toLowerCase();
    if (dateStr.includes("today")) {
      requestedDate = new Date().toISOString().split("T")[0];
    } else if (dateStr.includes("tomorrow")) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      requestedDate = tomorrow.toISOString().split("T")[0];
    } else {
      // Try to parse MM/DD/YYYY or similar
      const dateMatch = intent.neededDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        requestedDate = `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      } else {
        // Default to 7 days from now
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 7);
        requestedDate = defaultDate.toISOString().split("T")[0];
      }
    }
  } else {
    // Default to 7 days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    requestedDate = defaultDate.toISOString().split("T")[0];
  }

  // Build line items
  const lineItems = (intent.lineItems || []).map((item) => ({
    description: item.description || "Material",
    unit: item.unit || "EA",
    quantity: item.quantity || 1,
  }));

  // If no line items, create a placeholder
  if (lineItems.length === 0) {
    lineItems.push({
      description: "Materials needed",
      unit: "EA",
      quantity: 1,
    });
  }

  // Validate category
  const category = intent.category && MATERIAL_CATEGORIES.includes(intent.category as any)
    ? intent.category
    : "Other";

  const draft: Partial<DraftRFQ> = {
    status: "draft",
    title,
    category,
    fulfillmentType: intent.fulfillmentType || "DELIVERY",
    requestedDate,
    location: intent.location,
    lineItems,
    notes: intent.notes,
    urgency: intent.urgency,
    createdAt: now,
    updatedAt: now,
  };

  return draft;
}

/**
 * Determine draft status based on completeness
 */
export function getDraftStatus(draft: Partial<DraftRFQ>): "Needs info" | "Ready to quote" {
  const hasCategory = !!draft.category && draft.category !== "Other";
  const hasFulfillmentType = !!draft.fulfillmentType;
  const hasLineItems = draft.lineItems && draft.lineItems.length > 0 && 
    draft.lineItems.every((item) => item.description && item.quantity > 0);
  const hasDate = !!draft.requestedDate;
  const hasLocation = draft.fulfillmentType === "PICKUP" || !!draft.location;

  if (hasCategory && hasFulfillmentType && hasLineItems && hasDate && hasLocation) {
    return "Ready to quote";
  }
  return "Needs info";
}

