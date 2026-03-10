/**
 * Sanitize LLM Extraction
 * Cleans and validates extracted draft data from LLM responses
 */

export interface ExtractedDraft {
  lineItems?: Array<{ description: string; quantity: number; unit?: string }>;
  fulfillmentType?: "pickup" | "delivery" | "PICKUP" | "DELIVERY";
  needBy?: string; // CRITICAL: Canonical key (neededBy is alias for backward compat)
  jobNameOrPo?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * Sanitize extracted draft from LLM
 */
export function sanitizeExtraction(extracted: unknown): ExtractedDraft {
  if (!extracted || typeof extracted !== "object") {
    return {};
  }
  
  const result: ExtractedDraft = {};
  const data = extracted as Record<string, unknown>;
  
  // Sanitize lineItems
  if (Array.isArray(data.lineItems)) {
    result.lineItems = data.lineItems
      .filter((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const i = item as Record<string, unknown>;
        return (
          typeof i.description === "string" &&
          typeof i.quantity === "number" &&
          i.quantity > 0
        );
      })
      .map((item: unknown) => {
        const i = item as Record<string, unknown>;
        return {
          description: String(i.description || ""),
          quantity: Number(i.quantity || 0),
          unit: i.unit ? String(i.unit) : undefined,
        };
      });
  }
  
  // Sanitize fulfillmentType
  if (data.fulfillmentType) {
    const ft = String(data.fulfillmentType).toLowerCase();
    if (ft === "pickup" || ft === "delivery") {
      result.fulfillmentType = ft as "pickup" | "delivery";
    }
  }
  
  // Sanitize needBy (date string) - canonical key
  // Accept neededBy as alias for backward compatibility
  const needByValue = data.needBy || (data as any).neededBy;
  if (needByValue && typeof needByValue === "string") {
    result.needBy = needByValue.trim();
  }
  
  // Sanitize jobNameOrPo
  if (data.jobNameOrPo && typeof data.jobNameOrPo === "string") {
    result.jobNameOrPo = data.jobNameOrPo.trim();
  }
  
  // Sanitize category
  if (data.category && typeof data.category === "string") {
    result.category = data.category.trim();
  }
  
  return result;
}






