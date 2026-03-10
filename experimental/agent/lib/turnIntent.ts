/**
 * Turn Intent Classifier
 * Determines the user's intent for the current turn
 * Simple deterministic rules - no LLM required
 */

import { computeRfqStatus, type FieldId } from "./rfqStatus";

export type TurnIntent = "ASK_INFO" | "PROCURE" | "PROCUREMENT" | "ADVICE" | "CONFIRM" | "DECLINE";

/**
 * Detect pricing confirmation messages
 */
function isPricingConfirmation(msg: string): boolean {
  const lower = msg.trim().toLowerCase();
  const confirmationPatterns = [
    /^(yes|yeah|yep|yup|sure|ok|okay|alright|all right)$/,
    /^(go ahead|do it|please|get pricing|get quotes?|send it|send this|proceed)$/,
    /^(yes,? please|yeah,? please|sure,? please|go ahead,? please)$/,
    /^(yes,? get|yeah,? get|sure,? get|please get)/,
    /^(send|send to|send this to|send it to)/,
    /(send to suppliers?|send to my preferred supplier|send to preferred|preferred supplier)/,
    /(price it|quote it)/,
  ];
  return confirmationPatterns.some(pattern => pattern.test(lower));
}

/**
 * Detect turn intent based on message, draft, and thread state
 */
export function detectTurnIntent(input: {
  message: string;
  draft: any;
  threadState: any;
  conversationMode: "advice" | "procurement";
}): TurnIntent {
  const { message, draft, threadState, conversationMode } = input;
  const lower = message.toLowerCase().trim();

  // Compute RFQ status to check readiness
  const status = computeRfqStatus({
    draft,
    threadState,
  });

  // 1) CONFIRM: pricing confirmation AND ready to confirm
  // Also handle "just do it", "just create an order", "just order"
  const isJustDoIt = /\b(just\s+(?:do\s+it|create|order|send|get))\b/i.test(lower) ||
                     /\b(just\s+(?:an?\s+)?order\s+for\s+that)\b/i.test(lower);
  
  if (status.isReadyToConfirm && (isPricingConfirmation(message) || isJustDoIt)) {
    return "CONFIRM";
  }

  // 2) DECLINE: decline phrases AND ready to confirm
  if (status.isReadyToConfirm && (
    lower.includes("no") ||
    lower.includes("not yet") ||
    lower.includes("wait") ||
    lower.includes("later") ||
    lower.includes("not now")
  )) {
    return "DECLINE";
  }

  // 3) PROCURE: user expresses procurement intent (order/quote/price/send/buy/need X of Y)
  // INTENT IS AUTHORITATIVE - no dependency on conversationMode
  // CRITICAL: Any message with material + quantity MUST be treated as PROCURE intent
  const procurementKeywords = [
    /\b(order|quote|price|pricing|send|buy|purchase|need|get)\s+(?:for|me|this|a|an)?\s*(?:pricing|quote|order)/i,
    /\b(create|make|build)\s+(?:an?\s+)?order/i,
    /\bsend\s+(?:for|to|out)\s+(?:pricing|quotes?|suppliers?)/i,
    /\bget\s+(?:pricing|quotes?|a quote)/i,
    /\b(need|want|require)\s+\d+/i, // "need 100 bundles"
    /\b\d+\s+(?:bundles?|pieces?|squares?)\s+(?:of\s+)?(?:shingles?|siding|lumber|boards?)/i, // "100 bundles of shingles"
    /\bsend\s+this\s+out\s+for\s+pricing/i, // "send this out for pricing"
    /\bwho\s+can\s+supply/i, // "who can supply this"
    /\bget\s+quotes/i, // "get quotes"
  ];
  
  // CRITICAL: Detect material + quantity patterns (MUST be PROCURE intent)
  // Patterns: "10 sheets of OSB", "10 OSB", "10 pcs osb", "need 10 osb sheets", "200 2x4s", "15 bundles shingles"
  const materialQuantityPatterns = [
    /\b\d+\s+(?:sheets?|pcs?|pieces?|bundles?|squares?|boards?|ft|feet|lf|linear\s+feet?)\s+(?:of\s+)?(?:osb|plywood|shingles?|siding|lumber|boards?|2x4s?|2\s*x\s*4s?|drywall|insulation|materials?)/i,
    /\b\d+\s+(?:osb|plywood|shingles?|siding|lumber|boards?|2x4s?|2\s*x\s*4s?|drywall|insulation)\s+(?:sheets?|pcs?|pieces?|bundles?|squares?|boards?)/i,
    /\b(?:need|want|require|get|order)\s+\d+\s+(?:sheets?|pcs?|pieces?|bundles?|squares?|boards?|ft|feet)\s+(?:of\s+)?(?:osb|plywood|shingles?|siding|lumber|boards?|2x4s?|2\s*x\s*4s?|drywall|insulation|materials?)/i,
    /\b(?:need|want|require|get|order)\s+\d+\s+(?:osb|plywood|shingles?|siding|lumber|boards?|2x4s?|2\s*x\s*4s?|drywall|insulation)\s+(?:sheets?|pcs?|pieces?|bundles?|squares?|boards?)/i,
  ];
  
  const hasProcurementIntent = procurementKeywords.some(pattern => pattern.test(message));
  const hasMaterialQuantity = materialQuantityPatterns.some(pattern => pattern.test(message));
  
  // PROCURE intent always wins - no state veto
  // CRITICAL: Material + quantity MUST be PROCURE intent (never refuse, never treat as advice)
  if (hasProcurementIntent || hasMaterialQuantity) {
    return "PROCURE";
  }

  // 4) ASK_INFO: informational questions that do NOT request pricing/ordering
  // Can occur in either mode - gear selection will handle staying in procurement
  const infoQuestionPatterns = [
    /\bhow\s+(?:many|much|thick|long|wide|tall)\b/i,
    /\bwhat\s+(?:is|are|does|do|'s)\b/i,
    /\b(?:thickness|coverage|convert|pieces?|squares?|sq\s*ft)\b/i,
  ];
  
  const isQuestion = message.includes("?") || 
                     /^(how|what|convert)/i.test(message.trim());
  
  // ASK_INFO if it's a question AND has info patterns AND does NOT have procurement intent
  // No dependency on conversationMode - gear selection will preserve procurement mode
  if (isQuestion && infoQuestionPatterns.some(pattern => pattern.test(message)) && !hasProcurementIntent) {
    return "ASK_INFO";
  }

  // 5) PROCUREMENT: already in procurement mode (for continuity)
  // This helps resume procurement slot-filling
  if (conversationMode === "procurement") {
    return "PROCUREMENT";
  }

  // 6) Default to ADVICE
  return "ADVICE";
}

