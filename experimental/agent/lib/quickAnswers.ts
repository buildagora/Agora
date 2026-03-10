/**
 * Quick Answer Handlers
 * Handles direct questions that should bypass procurement interrogation
 */

export interface QuickAnswerResult {
  handled: boolean;
  assistantText: string;
  draftPatch?: Record<string, unknown>;
}

/**
 * Answer quick questions about quantities, coverage, conversions
 */
export function answerQuickQuestion(
  message: string,
  context: { draft: any }
): QuickAnswerResult {
  const lower = message.toLowerCase();
  const draft = context.draft || {};

  // Check for "squares" in siding context
  const isSiding = 
    lower.includes("siding") ||
    lower.includes("hardie") ||
    lower.includes("lap") ||
    lower.includes("fiber cement") ||
    draft.categoryId?.toLowerCase().includes("siding") ||
    draft.categoryId === "lumber_siding";

  if (isSiding && (lower.includes("square") || lower.includes("sq ft") || lower.includes("coverage"))) {
    // Extract number of squares if mentioned
    const squareMatch = message.match(/\b(\d+)\s*squares?\b/i);
    const sqftMatch = message.match(/\b(\d+)\s*(sq\s*ft|square\s*feet)\b/i);
    
    let totalSqft = 0;
    if (squareMatch) {
      totalSqft = parseInt(squareMatch[1], 10) * 100; // 1 square = 100 sq ft
    } else if (sqftMatch) {
      totalSqft = parseInt(sqftMatch[1], 10);
    }

    if (totalSqft > 0) {
      // Default assumptions: 12' boards, 7" exposure
      const boardLength = 12; // feet
      const exposure = 7 / 12; // feet (7 inches)
      const coveragePerBoard = exposure * boardLength; // sq ft per board
      const boardsNeeded = Math.ceil(totalSqft / coveragePerBoard * 1.1); // 10% waste

      let response = `In siding, "square" means 100 sq ft of coverage. So ${squareMatch ? squareMatch[1] : Math.floor(totalSqft / 100)} squares = ${totalSqft.toLocaleString()} sq ft coverage.\n\n`;
      response += `For ${totalSqft.toLocaleString()} sq ft, you'd need approximately ${boardsNeeded} boards (assuming 12' boards at 7" exposure, with 10% waste).\n\n`;
      response += `Want me to turn this into an RFQ?`;

      return {
        handled: true,
        assistantText: response,
      };
    } else {
      // Ask ONE clarifier if we can't compute
      return {
        handled: true,
        assistantText: "In siding, 'square' means 100 sq ft of coverage. To calculate the exact number of boards, I need to know: Are these 12' boards at ~7\" exposure, or something else?",
      };
    }
  }

  // Check for "bundles of shingles"
  const bundleMatch = message.match(/\b(\d+)\s*bundles?\s*(?:of\s*)?(?:shingles?|oakridge|onyx)?/i);
  if (bundleMatch) {
    const quantity = parseInt(bundleMatch[1], 10);
    const product = message.match(/\b(oakridge|onyx|black|shingles?)\b/i)?.[0] || "shingles";
    
    let response = `Got it — ${quantity} bundles of ${product}.\n\n`;
    
    // Check what's missing for next step
    const hasFulfillment = draft.fulfillmentType || draft.delivery?.pickupOrDelivery;
    // CRITICAL: Use canonical needBy (neededBy is alias for backward compat)
    const hasTiming = draft.needBy || (draft as any).neededBy || draft.timeline?.needByDate;
    const hasJobName = draft.jobNameOrPo;

    if (!hasFulfillment) {
      response += "Do you need pickup or delivery?";
      return {
        handled: true,
        assistantText: response,
        draftPatch: {
          lineItems: [{
            description: `${quantity} bundles ${product}`,
            quantity: quantity,
            unit: "bundles",
          }],
        },
      };
    } else if (!hasTiming) {
      response += "When do you need them by?";
      return {
        handled: true,
        assistantText: response,
        draftPatch: {
          lineItems: [{
            description: `${quantity} bundles ${product}`,
            quantity: quantity,
            unit: "bundles",
          }],
          fulfillmentType: hasFulfillment,
        },
      };
    } else if (!hasJobName) {
      response += "What's the job name or PO number? (Or say 'no PO' and we'll proceed.)";
      return {
        handled: true,
        assistantText: response,
        draftPatch: {
          lineItems: [{
            description: `${quantity} bundles ${product}`,
            quantity: quantity,
            unit: "bundles",
          }],
          fulfillmentType: hasFulfillment,
          needBy: hasTiming, // CRITICAL: Use canonical needBy (not neededBy)
        },
      };
    } else {
      response += "Want me to send this out for pricing now?";
      return {
        handled: true,
        assistantText: response,
        draftPatch: {
          lineItems: [{
            description: `${quantity} bundles ${product}`,
            quantity: quantity,
            unit: "bundles",
          }],
          fulfillmentType: hasFulfillment,
          needBy: hasTiming, // CRITICAL: Use canonical needBy (not neededBy)
          jobNameOrPo: hasJobName,
        },
      };
    }
  }

  // Not handled
  return {
    handled: false,
    assistantText: "",
  };
}

