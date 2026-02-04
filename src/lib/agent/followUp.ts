/**
 * Slot Follow-Up Handler
 * Handles deterministic follow-up responses when a slot was just asked
 */

export interface FollowUpResult {
  handled: boolean;
  draftPatch?: Record<string, unknown>;
  assistantText?: string;
}

/**
 * Handle slot follow-up based on last asked slot and user message
 */
export function handleSlotFollowUp(
  lastAskedSlot: string | undefined,
  message: string
): FollowUpResult {
  if (!lastAskedSlot) {
    return { handled: false };
  }
  
  const lowerMessage = message.toLowerCase().trim();
  
  // Simple pattern matching for common responses
  // This is a minimal implementation - can be expanded as needed
  
  switch (lastAskedSlot) {
    case "jobType":
      if (lowerMessage.match(/\b(repair|fix|patch)\b/)) {
        return {
          handled: true,
          draftPatch: { jobType: "repair" },
          assistantText: "Got it — repair job.",
        };
      }
      if (lowerMessage.match(/\b(replace|replacement|redo)\b/)) {
        return {
          handled: true,
          draftPatch: { jobType: "replace" },
          assistantText: "Got it — replacement.",
        };
      }
      if (lowerMessage.match(/\b(new|new construction|new build)\b/)) {
        return {
          handled: true,
          draftPatch: { jobType: "new" },
          assistantText: "Got it — new construction.",
        };
      }
      if (lowerMessage.match(/\b(insurance|claim)\b/)) {
        return {
          handled: true,
          draftPatch: { jobType: "insurance" },
          assistantText: "Got it — insurance job.",
        };
      }
      break;
      
    case "delivery":
    case "fulfillmentType":
      if (lowerMessage.match(/\b(pickup|pick up|will pick|i'll pick)\b/)) {
        return {
          handled: true,
          draftPatch: { 
            fulfillmentType: "PICKUP",
            delivery: { pickupOrDelivery: "pickup" },
          },
          assistantText: "Pickup, got it.",
        };
      }
      if (lowerMessage.match(/\b(delivery|deliver|ship|bring)\b/)) {
        return {
          handled: true,
          draftPatch: { 
            fulfillmentType: "DELIVERY",
            delivery: { pickupOrDelivery: "delivery" },
          },
          assistantText: "Delivery to the job site, perfect.",
        };
      }
      break;
  }
  
  return { handled: false };
}





