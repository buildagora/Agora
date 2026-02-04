/**
 * Agora Agent V1.1 - Deterministic State Machine
 * Manages conversation flow and draft building
 */

import { parseCategory, parseFulfillment, parseNeededBy, parseLocation, parseLineItems, parseRoofMaterialType, parseRoofSizeSquares, parseRoofAccessoriesNeeded, parsePriority } from "./parse";
import { isMaterialsList } from "./materialsGate";
import { getAssistantPrompt } from "./prompts";
import { labelToCategoryId } from "@/lib/categoryIds";

// Import looksLikeAddress for address rejection in line items parsing
function looksLikeAddress(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Pattern 1: Contains state abbreviations AND street number pattern
  const stateAbbrevs = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
  const streetNumber = /\b\d+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|circle|ct|court|place|pl)\b/i;
  const zipCode = /\b\d{5}(?:-\d{4})?\b/;
  
  if ((stateAbbrevs.test(lowerText) || zipCode.test(lowerText)) && streetNumber.test(lowerText)) {
    return true;
  }
  
  // Pattern 2: City/state comma format with ZIP
  const cityStateZip = /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/i;
  if (cityStateZip.test(text)) {
    return true;
  }
  
  // Pattern 3: Contains "ZIP" or "zip code" with street number
  if ((/\bzip\b/i.test(lowerText) || /\bzip\s*code\b/i.test(lowerText)) && streetNumber.test(lowerText)) {
    return true;
  }
  
  return false;
}

/**
 * Infer urgency from neededBy date
 */
export function inferUrgency(requestedDate?: string): "urgent" | "medium" | "normal" {
  if (!requestedDate) return "normal";
  
  const now = new Date();
  const needed = new Date(requestedDate);
  const diffDays = Math.ceil((needed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 1) return "urgent"; // today or tomorrow
  if (diffDays <= 3) return "medium"; // 2-3 days
  return "normal"; // >3 days
}

/**
 * Determine sourcing strategy based on priority and urgency
 */
export function determineStrategy(
  priority: "fastest" | "best_price" | "preferred" | "not_sure",
  urgency: "urgent" | "medium" | "normal",
  lineItemsCount: number
): { strategy: "reverse_auction" | "direct_quote" | "preferred_supplier"; supplierCountTarget: number } {
  if (priority === "preferred") {
    return { strategy: "preferred_supplier", supplierCountTarget: 1 };
  }
  
  if (priority === "fastest" || urgency === "urgent") {
    return { strategy: "direct_quote", supplierCountTarget: 2 };
  }
  
  if (priority === "best_price") {
    // Use more suppliers if many line items
    const supplierCount = lineItemsCount > 5 ? 12 : 8;
    return { strategy: "reverse_auction", supplierCountTarget: supplierCount };
  }
  
  // priority === "not_sure" - default based on urgency
  if (urgency === "medium") {
    return { strategy: "direct_quote", supplierCountTarget: 2 };
  }
  
  // Normal urgency, not sure -> default to reverse auction
  const supplierCount = lineItemsCount > 5 ? 12 : 8;
  return { strategy: "reverse_auction", supplierCountTarget: supplierCount };
}

export type AgentStage = 
  | "idle"
  | "need_category"
  | "need_fulfillment"
  | "need_date"
  | "need_location"
  | "need_line_items"
  | "need_job_name_po"
  | "ready";

export type ExpectedField = 
  | "category" 
  | "fulfillment" 
  | "neededBy" 
  | "deliveryAddress" 
  | "roofMaterialType"
  | "roofSizeSquares"
  | "roofAccessoriesNeeded"
  | "lineItems"
  | "priority"
  | "jobNamePo" 
  | "notes" 
  | null;

export interface AgentState {
  stage: AgentStage;
  expectedField: ExpectedField; // Single source of truth for what we're collecting
  draft: {
    category?: string; // Legacy: display label
    categoryId?: string; // NEW: canonical ID (e.g., "roofing")
    fulfillmentType?: "PICKUP" | "DELIVERY";
    requestedDate?: string; // ISO date string
    location?: string; // Delivery address
    // Roofing-specific fields
    roofMaterialType?: "shingle" | "metal";
    roofSizeSquares?: number; // Number of squares
    roofAccessoriesNeeded?: boolean; // Whether accessories are needed
    lineItems?: Array<{
      description: string;
      unit: string;
      quantity: number;
    }>;
    // Sourcing strategy fields
    priority?: "fastest" | "best_price" | "preferred" | "not_sure";
    strategy?: "reverse_auction" | "direct_quote" | "preferred_supplier";
    supplierCountTarget?: number;
    title?: string;
    notes?: string;
    jobNameOrPo?: string; // Job name or PO number for organization
  };
  hasShownCompletion?: boolean; // Track if completion message has been shown
  lastBotPromptKey?: string; // Track last bot prompt to prevent duplicates
}

export interface AgentEvent {
  type: "USER_MESSAGE";
  text: string;
}

export interface AgentStepResult {
  nextState: AgentState;
  botMessage?: string;
  quickReplies?: string[];
}

/**
 * Determine next expected field based on current draft state
 * This is the single source of truth for what field we're collecting
 */
export function getNextExpectedField(draft: AgentState["draft"]): ExpectedField {
  // Priority order:
  // a) if !draft.category -> "category"
  if (!draft.category) {
    return "category";
  }
  // b) if !draft.fulfillment -> "fulfillment"
  if (!draft.fulfillmentType) {
    return "fulfillment";
  }
  // c) if !draft.neededBy -> "neededBy"
  if (!draft.requestedDate) {
    return "neededBy";
  }
  // d) if draft.fulfillment==="delivery" && !draft.deliveryAddress -> "deliveryAddress"
  if (draft.fulfillmentType === "DELIVERY" && !draft.location) {
    return "deliveryAddress";
  }
  // e) If category is Roofing, collect Roofing-specific fields first
  if (draft.category?.toLowerCase() === "roofing") {
    if (!draft.roofMaterialType) {
      return "roofMaterialType";
    }
    if (draft.roofSizeSquares === undefined || draft.roofSizeSquares === null) {
      return "roofSizeSquares";
    }
    if (draft.roofAccessoriesNeeded === undefined || draft.roofAccessoriesNeeded === null) {
      return "roofAccessoriesNeeded";
    }
  }
  // f) if draft.lineItems is empty -> "lineItems"
  if (!draft.lineItems || draft.lineItems.length === 0) {
    return "lineItems";
  }
  // g) if !draft.priority -> "priority" (sourcing strategy)
  if (!draft.priority) {
    return "priority";
  }
  // h) if !draft.jobNamePo (optional but ask) -> "jobNamePo"
  if (!draft.jobNameOrPo || draft.jobNameOrPo.trim() === "") {
    return "jobNamePo";
  }
  // i) else -> null (all required fields collected)
  return null;
}

/**
 * Determine next stage based on current state (for backward compatibility)
 */
function determineNextStage(state: AgentState): AgentStage {
  const expectedField = state.expectedField ?? getNextExpectedField(state.draft);
  
  switch (expectedField) {
    case "category":
      return "need_category";
    case "fulfillment":
      return "need_fulfillment";
    case "neededBy":
      return "need_date";
    case "deliveryAddress":
      return "need_location";
    case "roofMaterialType":
    case "roofSizeSquares":
    case "roofAccessoriesNeeded":
      // Roofing-specific fields map to need_line_items stage (before collecting line items)
      return "need_line_items";
    case "lineItems":
      return "need_line_items";
    case "priority":
      return "ready"; // Priority is optional, so we can proceed
    case "jobNamePo":
      return "need_job_name_po";
    case "notes":
    case null:
      return "ready";
    default:
      return "ready";
  }
}

/**
 * Generate quick reply options for a stage
 */
function generateQuickReplies(stage: AgentStage): string[] | undefined {
  switch (stage) {
    case "need_category":
      return ["HVAC", "Plumbing", "Electrical", "Roofing", "Lumber/Siding"];
    
    case "need_fulfillment":
      return ["Delivery", "Pickup"];
    
    default:
      return undefined;
  }
}

/**
 * Step the agent state machine forward
 * Pure function: state + event -> new state + bot response
 * CRITICAL: Only parses the expectedField, never extracts other fields
 * Includes no-op guard to prevent duplicate prompts
 */
export function stepAgent(state: AgentState, event: AgentEvent): AgentStepResult {
  // Clone draftBefore for comparison (deep clone for nested objects)
  const draftBefore = JSON.parse(JSON.stringify(state.draft));
  
  // Create updated draft (start with current state)
  const updatedDraft = { ...state.draft };
  
  // Get current expectedField (single source of truth)
  const currentExpectedField = state.expectedField ?? getNextExpectedField(state.draft);
  
  if (process.env.NODE_ENV === "development") {
    console.debug("🔄 STEP_AGENT_START", {
      expectedFieldBefore: currentExpectedField,
      lastBotPromptKey: state.lastBotPromptKey,
    });
  }
  
  // Track parse failures to ensure reprompts
  let parseFailed = false;
  let parseFailureField: string | null = null;
  
  // CRITICAL: STEP-GATED SLOT FILLING
  // Only parse the ONE field we're currently asking for
  // NEVER extract other fields from the same message
  if (currentExpectedField === "category") {
    const category = parseCategory(event.text);
    if (category) {
      updatedDraft.category = category;
      // Also convert to categoryId for canonical matching
      const categoryId = labelToCategoryId[category as keyof typeof labelToCategoryId];
      if (categoryId) {
        updatedDraft.categoryId = categoryId;
      }
    } else {
      parseFailed = true;
      parseFailureField = "category";
    }
    // Do NOT parse any other fields
  } else if (currentExpectedField === "fulfillment") {
    const fulfillment = parseFulfillment(event.text);
    if (fulfillment) {
      updatedDraft.fulfillmentType = fulfillment.toUpperCase() as "PICKUP" | "DELIVERY";
    } else {
      parseFailed = true;
      parseFailureField = "fulfillment";
    }
    // Do NOT parse any other fields
  } else if (currentExpectedField === "neededBy") {
    const date = parseNeededBy(event.text);
    if (date) {
      updatedDraft.requestedDate = date.toISOString().split("T")[0];
    } else {
      parseFailed = true;
      parseFailureField = "neededBy";
    }
    // Do NOT parse any other fields
  } else if (currentExpectedField === "deliveryAddress") {
    const location = parseLocation(event.text);
    if (location) {
      updatedDraft.location = location;
    } else {
      parseFailed = true;
      parseFailureField = "deliveryAddress";
    }
    // CRITICAL: Do NOT parse this as line items or any other field
  } else if (currentExpectedField === "lineItems") {
    // CRITICAL: Only parse line items when expectedField is "lineItems"
    // Address rejection is handled in parseLineItems() and looksLikeAddress()
    
    // First check: reject if it looks like an address
    if (looksLikeAddress(event.text)) {
      // Do NOT update lineItems - this is an address, not materials
      // The agent will ask again for materials
    } else if (isMaterialsList(event.text)) {
      const lineItems = parseLineItems(event.text);
      if (lineItems && lineItems.length > 0) {
        // Safety: Filter out vague items that aren't real materials
        const validItems = lineItems.filter((item) => {
          const name = (item.description || "").toLowerCase().trim();
          const vaguePatterns = [
            "need material",
            "need materials",
            "new roof",
            "roofing project",
            "need help",
            "get quote",
            "and", // Common conjunction that shouldn't be a line item
            "or", // Common conjunction
          ];
          // Reject if name is too short (likely a token) or matches vague patterns
          if (name.length < 2) return false;
          return !vaguePatterns.some((vague) => name.includes(vague));
        });

        if (validItems.length > 0) {
          updatedDraft.lineItems = validItems.map((item) => ({
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
          }));
        }
      }
    }
    // If address was detected or parsing failed, lineItems remain unchanged
  } else if (currentExpectedField === "roofMaterialType") {
    const materialType = parseRoofMaterialType(event.text);
    if (materialType) {
      updatedDraft.roofMaterialType = materialType;
    } else {
      parseFailed = true;
      parseFailureField = "roofMaterialType";
      if (process.env.NODE_ENV === "development") {
        console.log("PARSE_FAIL_roofMaterialType", {
          rawInput: event.text,
          normalizedInput: event.text.trim().toLowerCase(),
        });
      }
    }
  } else if (currentExpectedField === "roofSizeSquares") {
    const squares = parseRoofSizeSquares(event.text, currentExpectedField);
    if (squares !== null && squares > 0) {
      updatedDraft.roofSizeSquares = squares;
    } else {
      parseFailed = true;
      parseFailureField = "roofSizeSquares";
      if (process.env.NODE_ENV === "development") {
        console.log("PARSE_FAIL_roofSizeSquares", {
          rawInput: event.text,
          normalizedInput: event.text.trim().toLowerCase(),
        });
      }
    }
  } else if (currentExpectedField === "roofAccessoriesNeeded") {
    const accessoriesNeeded = parseRoofAccessoriesNeeded(event.text);
    if (accessoriesNeeded !== null) {
      updatedDraft.roofAccessoriesNeeded = accessoriesNeeded;
    } else {
      parseFailed = true;
      parseFailureField = "roofAccessoriesNeeded";
    }
  } else if (currentExpectedField === "priority") {
    const priority = parsePriority(event.text);
    if (priority) {
      updatedDraft.priority = priority;
      
      // Auto-determine strategy based on priority and urgency
      const urgency = inferUrgency(updatedDraft.requestedDate);
      const lineItemsCount = updatedDraft.lineItems?.length || 0;
      const strategyResult = determineStrategy(priority, urgency, lineItemsCount);
      updatedDraft.strategy = strategyResult.strategy;
      updatedDraft.supplierCountTarget = strategyResult.supplierCountTarget;
    } else {
      parseFailed = true;
      parseFailureField = "priority";
    }
  } else if (currentExpectedField === "jobNamePo") {
    // Simple: store raw text as job name/PO
    const trimmed = event.text.trim();
    if (trimmed.length > 0) {
      updatedDraft.jobNameOrPo = trimmed;
    } else {
      parseFailed = true;
      parseFailureField = "jobNamePo";
    }
  }
  // Notes are NEVER auto-populated from chat (only manual user input)
  
  // Generate title from category and first line item
  if (updatedDraft.category && updatedDraft.lineItems && updatedDraft.lineItems.length > 0) {
    const firstItem = updatedDraft.lineItems[0];
    updatedDraft.title = `${updatedDraft.category}: ${firstItem.description}`;
  } else if (updatedDraft.category) {
    updatedDraft.title = `${updatedDraft.category} Materials`;
  }
  
  // Recompute expectedField after updating draft
  const nextExpectedField = getNextExpectedField(updatedDraft);
  
  // NO-OP GUARD: Check if draft changed
  const draftChanged = JSON.stringify(draftBefore) !== JSON.stringify(updatedDraft);
  const expectedFieldChanged = currentExpectedField !== nextExpectedField;
  
  // Generate prompt key for no-op detection
  const promptKey = `${updatedDraft.category || "none"}:${nextExpectedField}`;
  const isSamePrompt = state.lastBotPromptKey === promptKey;
  
  if (process.env.NODE_ENV === "development") {
    console.debug("🔄 STEP_AGENT_AFTER_PARSE", {
      expectedFieldAfter: nextExpectedField,
      draftChanged,
      expectedFieldChanged,
      promptKey,
      isSamePrompt,
      lastBotPromptKey: state.lastBotPromptKey,
    });
  }
  
  // NO-OP: If draft didn't change AND expectedField didn't change AND same prompt key
  // -> return null botMessage to prevent duplicate prompt
  // EXCEPTION: If parse failed, always reprompt (even if draft unchanged)
  if (!draftChanged && !expectedFieldChanged && isSamePrompt && !parseFailed) {
    if (process.env.NODE_ENV === "development") {
      console.debug("🚫 NO_OP_GUARD_TRIGGERED", {
        reason: "draft unchanged, expectedField unchanged, same prompt key",
        promptKey,
      });
    }
    // Return unchanged state with null botMessage
    return {
      nextState: {
        ...state,
        draft: updatedDraft, // Still return updated draft (even if unchanged)
        expectedField: nextExpectedField,
      },
      botMessage: undefined, // No bot message - prevents duplicate
      quickReplies: undefined,
    };
  }
  
  // Determine next stage (for backward compatibility)
  const nextStage = determineNextStage({ ...state, draft: updatedDraft, expectedField: nextExpectedField });
  
  // Generate bot message using pure prompt generator
  let botMessage: string | undefined;
  if (nextExpectedField === null && !state.hasShownCompletion) {
    // Build buyer-friendly message based on priority (no counts, no "reverse auction")
    const priority = updatedDraft.priority;
    if (priority === "preferred") {
      botMessage = "Perfect! Review the order on the right. When ready, click 'Send to Suppliers' and I'll route it to your preferred supplier (and a backup if needed).";
    } else if (priority === "fastest") {
      botMessage = "Perfect! Review the order on the right. When ready, click 'Send to Suppliers' and I'll route it to the fastest available suppliers.";
    } else {
      // best_price or not_sure -> broadcast to category
      botMessage = "Perfect! Review the order on the right. When ready, click 'Send to Suppliers' and I'll send it to qualified suppliers in this category.";
    }
  } else if (nextExpectedField === null) {
    botMessage = "I can help you with that. What would you like to know?";
  } else {
    // Use pure prompt generator based on expectedField
    const draftForPrompt = {
      category: updatedDraft.category || null,
      fulfillmentType: updatedDraft.fulfillmentType || null,
      requestedDate: updatedDraft.requestedDate || null,
      location: updatedDraft.location || null,
      lineItems: updatedDraft.lineItems || [],
      jobNameOrPo: updatedDraft.jobNameOrPo || null,
      notes: updatedDraft.notes || null,
    };
    
    botMessage = getAssistantPrompt(nextExpectedField, draftForPrompt);
    
    // V1 FIX: If parse failed, add example to reprompt and confirm intent
    if (parseFailed && parseFailureField === currentExpectedField) {
      const examples: Record<string, string> = {
        category: " (e.g., Roofing, HVAC, Plumbing)",
        fulfillment: " (e.g., Delivery or Pickup)",
        neededBy: " (e.g., tomorrow, Jan 15, or 1/15/2024)",
        deliveryAddress: " (e.g., 123 Main St, Huntsville, AL 35801)",
        roofMaterialType: " (e.g., Shingle or Metal)",
        roofSizeSquares: " (e.g., 10 or 10 squares)",
        roofAccessoriesNeeded: " (e.g., Yes or No)",
        priority: " (e.g., Fastest, Best price, Preferred supplier, or Not sure)",
        jobNamePo: " (e.g., Beirne Ave — PO 10492)",
      };
      const example = currentExpectedField ? (examples[currentExpectedField] || "") : "";
      // Add confirmation request when parse fails
      botMessage = `I didn't quite understand that. ${getAssistantPrompt(nextExpectedField, draftForPrompt)}${example}`;
    }
    
    // V1 FIX: Ensure botMessage is NEVER undefined - always provide a response
    if (!botMessage) {
      // Fallback: generic helpful response
      botMessage = "I'm here to help. Could you provide more details?";
    }
    
    // Special handling: if address was provided but expectedField is "lineItems", 
    // and parseLineItems rejected it, show helpful message
    if (nextExpectedField === "lineItems" && currentExpectedField === "deliveryAddress") {
      const location = parseLocation(event.text);
      if (location && parseLineItems(event.text) === null) {
        // Address was detected but line items parser rejected it
        botMessage = "That looks like an address — what materials and quantities do you need?";
      }
    }
  }
  
  const quickReplies = generateQuickReplies(nextStage);
  
  // Update lastBotPromptKey when emitting a bot message
  const nextState: AgentState = {
    stage: nextStage,
    expectedField: nextExpectedField,
    draft: updatedDraft,
    hasShownCompletion: nextExpectedField === null ? true : state.hasShownCompletion,
    lastBotPromptKey: botMessage ? promptKey : state.lastBotPromptKey, // Only update if we're emitting a message
  };
  
  if (process.env.NODE_ENV === "development") {
    console.debug("✅ STEP_AGENT_RESULT", {
      botMessage: botMessage ? botMessage.substring(0, 50) : null,
      nextBotPromptKey: nextState.lastBotPromptKey,
    });
  }
  
  return {
    nextState,
    botMessage,
    quickReplies,
  };
}

/**
 * Initialize agent state
 */
export function initAgentState(): AgentState {
  const draft = {};
  const expectedField = getNextExpectedField(draft);
  return {
    stage: "idle",
    expectedField,
    draft,
    hasShownCompletion: false,
    lastBotPromptKey: undefined,
  };
}
