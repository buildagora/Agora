/**
 * Agent Turn API - Resilient 3-Mode Pipeline
 * Handles all agent conversation turns with graceful degradation
 * 
 * 3 Modes:
 * - Mode A: LLM healthy (OpenAI configured and working)
 * - Mode B: LLM failing (timeout/rate limit) -> fallback to offline
 * - Mode C: LLM not configured -> offline mode
 * 
 * Returns:
 * { ok: true, mode: "advice"|"procurement", assistantText, draftPatch?, missing?, ready?, debug? }
 * or
 * { ok: false, error: "...", message: "...", status?: number }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireServerEnv } from "@/lib/env";
import { jsonError, withErrorHandling } from "@/lib/apiResponse";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getAIConfig } from "@/lib/ai/config";
import { offlineFilterRoofing, type RoofingDraft } from "@/lib/agent/offlineFilter";
import { getIntakeState } from "@/lib/agent/osrIntake";
import { getOSRQuestion, getAcknowledgment, type OSRDraft } from "@/lib/agent/osrQuestions";
import { parseLineItemsFromText } from "@/lib/agent/parseLineItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getTurnMode } from "@/lib/agent/intent";
import { handleSlotFollowUp } from "@/lib/agent/followUp";
import { sanitizeExtraction, type ExtractedDraft } from "@/lib/agent/sanitize";
import { ADVICE_SYSTEM_PROMPT, PROCUREMENT_EXTRACTION_PROMPT, getExtractionUserMessage } from "@/lib/agent/prompts";
import { hashString } from "@/lib/agent/intentRouter";

const AgentTurnSchema = z.object({
  message: z.string().min(1).max(8000),
  draft: z.record(z.string(), z.unknown()).optional(),
  threadId: z.string().optional(),
});

// Generate request ID for logging
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse relative date strings like "tomorrow", "today", "ASAP" to ISO date string
 * Uses server timezone (acceptable for MVP - can be enhanced with user timezone later)
 */
function parseRelativeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const lower = dateStr.toLowerCase().trim();
  const now = new Date();
  
  // ASAP or today -> use today's date
  if (lower === "asap" || lower.includes("today") || lower === "today") {
    return now.toISOString().split("T")[0]; // YYYY-MM-DD
  }
  
  // Tomorrow -> add 1 day
  if (lower === "tomorrow" || lower.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0]; // YYYY-MM-DD
  }
  
  // Next week -> add 7 days
  if (lower.includes("next week")) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split("T")[0];
  }
  
  // If already ISO format (YYYY-MM-DD), return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  
  // Try to parse MM/DD/YYYY or MM-DD-YYYY
  const usDateMatch = dateStr.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (usDateMatch) {
    const [, month, day, year] = usDateMatch;
    const fullYear = year.length === 2 ? (parseInt(year, 10) < 50 ? 2000 + parseInt(year, 10) : 1900 + parseInt(year, 10)) : parseInt(year, 10);
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  return null;
}

/**
 * Convert generic draft to OSR draft format
 */
function toOSRDraft(draft: Record<string, unknown>): Partial<OSRDraft> {
  return {
    category: draft.category as string,
    jobType: draft.jobType as OSRDraft["jobType"],
    roofType: draft.roofType as OSRDraft["roofType"],
    addressZip: draft.addressZip as string | null,
    roofSize: draft.roofSize as OSRDraft["roofSize"],
    delivery: draft.delivery as OSRDraft["delivery"],
    timeline: draft.timeline as OSRDraft["timeline"],
    lineItems: draft.lineItems as OSRDraft["lineItems"],
    fulfillmentType: draft.fulfillmentType as OSRDraft["fulfillmentType"],
    neededBy: (draft.neededBy || draft.needBy) as string,
    jobNameOrPo: draft.jobNameOrPo as string,
  };
}

/**
 * Call OpenAI for advice mode
 */
async function callAdviceMode(openai: OpenAI, message: string, model: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: ADVICE_SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
    temperature: 0.2,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || "I'm here to help. What can I assist you with?";
}

/**
 * Call OpenAI for procurement extraction
 */
async function callProcurementExtraction(
  openai: OpenAI,
  message: string,
  currentDraft: Record<string, unknown>,
  model: string
): Promise<ExtractedDraft> {
  const userMessage = getExtractionUserMessage(message, currentDraft);
  
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: PROCUREMENT_EXTRACTION_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {};
  }

  try {
    const extracted = JSON.parse(content);
    return sanitizeExtraction(extracted);
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // TEMPORARY: Verification log (server-only, will be removed after verification)
  console.log("OpenAI configured:", Boolean(process.env.OPENAI_API_KEY));

  return withErrorHandling(async () => {
    requireServerEnv();

    // Step 1: Check AI configuration (3-mode determination)
    const aiConfigResult = getAIConfig();
    const isAIConfigured = aiConfigResult.ok;
    let offlineReason: string | undefined;

    if (!isAIConfigured) {
      // Mode C: LLM not configured -> offline mode
      offlineReason = aiConfigResult.error;
      console.log(`[AGENT_TURN] ${requestId} Mode: OFFLINE (${offlineReason})`);
    }

    // Step 2: Auth check
    let user;
    try {
      user = await requireCurrentUserFromRequest(req);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // Step 3: Rate limiting
    if (!checkRateLimit(`agent:${user.id}`, RATE_LIMITS.AGENT_TURN.maxTokens, RATE_LIMITS.AGENT_TURN.refillRate)) {
      return jsonError("RATE_LIMIT", "Too many requests. Please slow down.", 429);
    }

    // Step 4: Request size limit (32KB)
    const rawText = await req.text();
    if (rawText.length > 32 * 1024) {
      return jsonError("PAYLOAD_TOO_LARGE", "Request body too large (max 32KB)", 413);
    }

    // Step 5: Parse and validate body
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const bodyValidation = AgentTurnSchema.safeParse(body);
    if (!bodyValidation.success) {
      return jsonError("BAD_REQUEST", "Invalid request body", 400, bodyValidation.error.issues);
    }

    const { message, draft } = bodyValidation.data;
    const currentDraft = (draft as Record<string, unknown>) || {};

    // CRITICAL: Prevent re-processing the same message
    // Generate hash of user message (normalized: trim, lowercase)
    const messageHash = hashString(message.trim().toLowerCase());
    const lastProcessedHash = currentDraft.__lastUserMessageHash as string | undefined;
    
    if (lastProcessedHash === messageHash) {
      // This exact message was already processed - return cached response or noop
      if (process.env.NODE_ENV === "development") {
        console.log(`[AGENT_TURN] ${requestId} DUPLICATE_MESSAGE_DETECTED`, {
          messageHash,
          messagePreview: message.substring(0, 50),
        });
      }
      
      // Return current state without re-processing
      const intakeState = getIntakeState(toOSRDraft(currentDraft), currentDraft.__lastAskedSlot as string | undefined);
      return NextResponse.json({
        ok: true,
        mode: "procurement",
        assistantText: intakeState.ready 
          ? "Based on what you told me, I've got everything I need. Want me to get pricing on this?"
          : intakeState.nextQuestion || "What else do you need?",
        draftPatch: {
          conversationMode: currentDraft.conversationMode || "procurement",
          __lastAskedSlot: intakeState.nextSlot || undefined,
        },
        missing: intakeState.missingFields,
        ready: intakeState.ready,
        debug: {
          provider: "cached",
          offline: false,
          duplicate: true,
        },
      });
    }

    // LOG: Incoming draft from client
    if (process.env.NODE_ENV === "development") {
      console.log(`[AGENT_TURN] ${requestId} INCOMING_DRAFT`, {
        threadId: bodyValidation.data.threadId,
        draftKeys: Object.keys(currentDraft),
        hasLineItems: Array.isArray(currentDraft.lineItems) && currentDraft.lineItems.length > 0,
        lineItemsCount: Array.isArray(currentDraft.lineItems) ? currentDraft.lineItems.length : 0,
        jobNameOrPo: currentDraft.jobNameOrPo,
        neededBy: currentDraft.neededBy || currentDraft.needBy,
        lastAskedSlot: currentDraft.__lastAskedSlot,
        messageHash,
        lastProcessedHash,
      });
    }

    // Step 6: Determine conversation mode
    // For roofing V1, default to procurement mode if not explicitly advice
    let conversationMode = getTurnMode(message, currentDraft);
    
    // Force procurement mode for roofing-related messages or if draft has procurement fields
    const hasProcurementFields = currentDraft.lineItems || currentDraft.jobNameOrPo || currentDraft.neededBy || currentDraft.fulfillmentType;
    const isRoofingRelated = message.toLowerCase().match(/\b(roof|shingle|metal|tpo|epdm|materials|need|want|quote|pricing|rfq|request)\b/);
    
    if (hasProcurementFields || isRoofingRelated) {
      conversationMode = "procurement";
    }
    
    const draftPatch: Record<string, unknown> = {
      conversationMode,
    };
    
    // CRITICAL: If category is not set and message is roofing-related, set it
    if (!currentDraft.categoryId && !currentDraft.categoryLabel && isRoofingRelated) {
      draftPatch.categoryId = "roofing";
      draftPatch.categoryLabel = "Roofing";
    }
    
    // CRITICAL: Ensure default visibility is set (broadcast = reverse auction)
    if (!currentDraft.visibility) {
      draftPatch.visibility = "broadcast";
    }

    // Step 7: Handle advice mode
    if (conversationMode === "advice") {
      if (!isAIConfigured) {
        // Offline advice mode: simple fallback
        return NextResponse.json({
          ok: true,
          mode: "advice",
          assistantText: "I'm here to help with construction materials. What can I assist you with?",
          draftPatch: {
            ...draftPatch,
            __lastAskedSlot: undefined,
          },
          debug: {
            provider: "offline",
            offline: true,
            reason: offlineReason,
          },
        });
      }

      // Mode A: LLM healthy for advice
      try {
        const openai = new OpenAI({ apiKey: aiConfigResult.config.apiKey });
        const assistantText = await callAdviceMode(openai, message, aiConfigResult.config.model);
        
        const latency = Date.now() - startTime;
        console.log(`[AGENT_TURN] ${requestId} Advice mode | userId=${user.id} | latency=${latency}ms | mode=llm`);

        return NextResponse.json({
          ok: true,
          mode: "advice",
          assistantText,
          draftPatch: {
            ...draftPatch,
            __lastAskedSlot: undefined,
          },
          debug: {
            provider: "openai",
            offline: false,
          },
        });
      } catch (error) {
        // Mode B: LLM failing -> fallback to offline
        offlineReason = error instanceof Error ? error.message : "LLM_ERROR";
        console.error(`[AGENT_TURN] ${requestId} LLM failed, falling back to offline`, error);

        return NextResponse.json({
          ok: true,
          mode: "advice",
          assistantText: "I'm having some technical difficulties, but I'm here to help. What can I assist you with?",
          draftPatch: {
            ...draftPatch,
            __lastAskedSlot: undefined,
          },
          debug: {
            provider: "openai",
            offline: true,
            reason: offlineReason,
          },
        });
      }
    }

    // Step 8: Procurement mode (OSR-style intake flow)
    const lastAskedSlot = currentDraft.__lastAskedSlot as string | undefined;
    let updatedDraft = { ...currentDraft };
    const oldDraft = toOSRDraft(currentDraft);
    
    // Step 8a: Handle deterministic follow-up if lastAskedSlot exists
    let handledByFollowUp = false;
    let followUpResponse: string | undefined;
    
    if (lastAskedSlot) {
      const followUp = handleSlotFollowUp(lastAskedSlot, message);
      if (followUp.handled) {
        handledByFollowUp = true;
        if (followUp.draftPatch) {
          Object.assign(updatedDraft, followUp.draftPatch);
          Object.assign(draftPatch, followUp.draftPatch);
        }
        if (followUp.assistantText) {
          followUpResponse = followUp.assistantText;
        }
      }
    }

    // Step 8b: Try LLM extraction (if configured)
    let llmExtractionSucceeded = false;
    let finalMode: "llm" | "offline" | "fallback" = isAIConfigured ? "fallback" : "offline";
    
    if (isAIConfigured && !handledByFollowUp) {
      try {
        const openai = new OpenAI({ apiKey: aiConfigResult.config.apiKey });
        const extracted = await callProcurementExtraction(openai, message, updatedDraft, aiConfigResult.config.model);
        finalMode = "llm";
        llmExtractionSucceeded = true;
        
        // Merge extraction into updatedDraft
        if (extracted.lineItems) {
          updatedDraft.lineItems = extracted.lineItems;
        }
        if (extracted.fulfillmentType) {
          updatedDraft.fulfillmentType = extracted.fulfillmentType.toUpperCase() as "PICKUP" | "DELIVERY";
          // Also set delivery for OSR draft
          updatedDraft.delivery = { pickupOrDelivery: extracted.fulfillmentType.toLowerCase() as "pickup" | "delivery" };
        }
        if (extracted.neededBy) {
          // Parse relative dates like "tomorrow" to ISO date string
          const parsedDate = parseRelativeDate(extracted.neededBy);
          const dateValue = parsedDate || extracted.neededBy;
          
          updatedDraft.neededBy = dateValue;
          updatedDraft.needBy = dateValue;
          updatedDraft.timeline = { needByDate: dateValue };
        }
        
        const lowerMessage = message.toLowerCase();
        const hasJobLabelIntent = 
          lowerMessage.includes("po") ||
          lowerMessage.includes("purchase order") ||
          lowerMessage.includes("job name") ||
          lowerMessage.includes("label") ||
          lowerMessage.includes("call it");
        
        if (extracted.jobNameOrPo && (lastAskedSlot === "jobNameOrPo" || hasJobLabelIntent)) {
          updatedDraft.jobNameOrPo = extracted.jobNameOrPo;
        }
        
        // Merge into draftPatch (CRITICAL: Always write to canonical draft)
        const parsedDate = extracted.neededBy ? parseRelativeDate(extracted.neededBy) : null;
        const dateValue = parsedDate || extracted.neededBy;
        
        Object.assign(draftPatch, {
          ...(extracted.lineItems && { lineItems: extracted.lineItems }),
          ...(extracted.fulfillmentType && { fulfillmentType: extracted.fulfillmentType.toUpperCase() as "PICKUP" | "DELIVERY" }),
          ...(dateValue && { neededBy: dateValue, needBy: dateValue }),
          ...(extracted.jobNameOrPo && (lastAskedSlot === "jobNameOrPo" || hasJobLabelIntent) && { jobNameOrPo: extracted.jobNameOrPo }),
        });
      } catch (error) {
        // Mode B: LLM failing -> fallback to offline
        finalMode = "fallback";
        offlineReason = error instanceof Error ? error.message : "LLM_ERROR";
        console.error(`[AGENT_TURN] ${requestId} LLM extraction failed, falling back to offline`, error);
      }
    }

    // Step 8c: Offline extraction (if LLM not used or failed)
    if (!llmExtractionSucceeded) {
      // CRITICAL: Parse lineItems from message text (offline mode)
      // Only parse if lineItems is not already filled
      const hasLineItems = Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0;
      if (!hasLineItems) {
        const parsedItems = parseLineItemsFromText(message);
        if (parsedItems.length > 0) {
          updatedDraft.lineItems = parsedItems;
          draftPatch.lineItems = parsedItems;
          
          if (process.env.NODE_ENV === "development") {
            console.log(`[AGENT_TURN] ${requestId} PARSED_LINE_ITEMS`, {
              count: parsedItems.length,
              items: parsedItems.map(item => `${item.quantity} ${item.unit} ${item.description}`),
            });
          }
        }
      }
      
      // CRITICAL: Extract job name/PO from message (offline mode)
      // Check if user provided job name/PO and we asked for it
      if (lastAskedSlot === "jobNameOrPo" || message.toLowerCase().match(/\b(po|p\.o\.|purchase order|job name|job:|po:)\b/i)) {
        const jobNameMatch = message.match(/(?:po|p\.o\.|purchase order|job name|job:|po:)\s*[:\-]?\s*([^\n,\.]+)/i);
        if (jobNameMatch) {
          const jobName = jobNameMatch[1].trim();
          if (jobName && jobName.length > 0) {
            updatedDraft.jobNameOrPo = jobName;
            draftPatch.jobNameOrPo = jobName;
          }
        } else {
          // If no explicit label, check if message is just a short name/identifier
          const trimmed = message.trim();
          if (trimmed.length > 0 && trimmed.length < 50 && !trimmed.includes(" ") && lastAskedSlot === "jobNameOrPo") {
            updatedDraft.jobNameOrPo = trimmed;
            draftPatch.jobNameOrPo = trimmed;
          }
        }
      }
      
      // CRITICAL: Extract relative dates like "tomorrow" (offline mode)
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes("tomorrow") || lowerMessage.includes("today") || lowerMessage.includes("asap")) {
        const parsedDate = parseRelativeDate(message);
        if (parsedDate) {
          updatedDraft.neededBy = parsedDate;
          updatedDraft.needBy = parsedDate;
          updatedDraft.timeline = { needByDate: parsedDate };
          draftPatch.neededBy = parsedDate;
          draftPatch.needBy = parsedDate;
        }
      }
      
      // Check if this is a roofing RFQ (for V1)
      const category = (updatedDraft.category as string) || "";
      if (category.toLowerCase() === "roofing" || !category) {
        // Use offline filter for roofing
        const offlineResult = offlineFilterRoofing(message, updatedDraft as Partial<RoofingDraft>);
        Object.assign(updatedDraft, offlineResult.patch);
        Object.assign(draftPatch, offlineResult.patch);
        
        // CRITICAL: If category is inferred as roofing, ensure it's persisted
        if (!updatedDraft.categoryId && !updatedDraft.categoryLabel) {
          updatedDraft.categoryId = "roofing";
          updatedDraft.categoryLabel = "Roofing";
          draftPatch.categoryId = "roofing";
          draftPatch.categoryLabel = "Roofing";
        }
      }
      
      // CRITICAL: Ensure default visibility is set if not present
      if (!updatedDraft.visibility) {
        updatedDraft.visibility = "broadcast"; // Default to reverse auction
        draftPatch.visibility = "broadcast";
      }
    }

    // Step 8d: Convert to OSR draft and get intake state
    const newDraft = toOSRDraft(updatedDraft);
    
    // RULE 1: Track resolved slots - lock slots that were just filled
    // RULE 2: Unlock slots that were corrected (user provided different value)
    const existingResolvedSlots = Array.isArray(currentDraft.__resolvedSlots) 
      ? new Set(currentDraft.__resolvedSlots as string[])
      : currentDraft.__resolvedSlots instanceof Set
      ? new Set(currentDraft.__resolvedSlots)
      : new Set<string>();
    
    const newlyResolvedSlots = new Set<string>();
    const correctedSlots = new Set<string>();
    const corrections: string[] = [];
    
    // Check each slot - if it was empty and now has a value, lock it
    const slotsToCheck: Array<{ osrKey: string; canonicalKey: string }> = [
      { osrKey: "jobType", canonicalKey: "jobType" },
      { osrKey: "roofType", canonicalKey: "roofType" },
      { osrKey: "category", canonicalKey: "categoryId" },
      { osrKey: "fulfillmentType", canonicalKey: "fulfillmentType" },
      { osrKey: "delivery", canonicalKey: "fulfillmentType" },
      { osrKey: "addressZip", canonicalKey: "deliveryAddress" },
      { osrKey: "lineItems", canonicalKey: "lineItems" },
      { osrKey: "neededBy", canonicalKey: "needBy" },
      { osrKey: "jobNameOrPo", canonicalKey: "jobNameOrPo" },
    ];
    
    for (const { osrKey, canonicalKey } of slotsToCheck) {
      const oldValue = oldDraft[osrKey as keyof OSRDraft];
      const newValue = newDraft[osrKey as keyof OSRDraft];
      
      // Check if this slot was previously resolved
      const wasResolved = existingResolvedSlots.has(canonicalKey) || existingResolvedSlots.has(osrKey);
      
      // RULE 2: If slot was resolved and user provided a different value, unlock it (correction)
      if (wasResolved && oldValue && newValue) {
        const valuesDiffer = 
          (typeof oldValue === "string" && typeof newValue === "string" && oldValue.trim().toLowerCase() !== newValue.trim().toLowerCase()) ||
          (Array.isArray(oldValue) && Array.isArray(newValue) && JSON.stringify(oldValue) !== JSON.stringify(newValue)) ||
          (typeof oldValue === "object" && typeof newValue === "object" && JSON.stringify(oldValue) !== JSON.stringify(newValue)) ||
          (oldValue !== newValue);
        
        if (valuesDiffer) {
          // User corrected this slot - unlock it and re-lock with new value
          correctedSlots.add(canonicalKey);
          correctedSlots.add(osrKey);
          corrections.push(canonicalKey);
        }
      }
      
      // If slot was empty and now has a value, lock it
      if (!oldValue && newValue) {
        // Check if it's a meaningful value (not just empty string/array)
        const hasValue = 
          (typeof newValue === "string" && newValue.trim().length > 0) ||
          (Array.isArray(newValue) && newValue.length > 0) ||
          (typeof newValue === "object" && newValue !== null && Object.keys(newValue).length > 0) ||
          (typeof newValue !== "string" && typeof newValue !== "object" && newValue);
        
        if (hasValue) {
          newlyResolvedSlots.add(canonicalKey);
          newlyResolvedSlots.add(osrKey); // Also lock OSR key for compatibility
        }
      }
    }
    
    // Merge existing and newly resolved slots, but remove corrected slots first
    const allResolvedSlots = new Set(
      [...existingResolvedSlots]
        .filter(slot => !correctedSlots.has(slot)) // Remove corrected slots
        .concat([...newlyResolvedSlots]) // Add newly resolved slots
    );
    
    // Add resolved slots to draft
    if (allResolvedSlots.size > 0) {
      (newDraft as any).__resolvedSlots = Array.from(allResolvedSlots);
      draftPatch.__resolvedSlots = Array.from(allResolvedSlots);
    }
    
    // PHASE 1 RULE: Acknowledge only once, never restate known facts
    // PHASE 2 RULE: If we acknowledge, the value MUST be in draftPatch (canonical persistence)
    // Only acknowledge if:
    // 1. User just filled a slot (was empty, now has value) - acknowledge once
    // 2. User corrected a slot - acknowledge correction once
    // Never acknowledge if slot was already filled (user already knows we have it)
    let acknowledgment: string | null = null;
    if (lastAskedSlot && !handledByFollowUp) {
      const slotValue = newDraft[lastAskedSlot as keyof OSRDraft];
      const oldSlotValue = oldDraft[lastAskedSlot as keyof OSRDraft];
      
      // Check if this was a correction
      const wasCorrected = corrections.some(corr => {
        const mapping: Record<string, string> = {
          jobType: "jobType",
          roofType: "roofType",
          categoryId: "category",
          fulfillmentType: "fulfillmentType",
          deliveryAddress: "addressZip",
          lineItems: "lineItems",
          needBy: "neededBy",
          jobNameOrPo: "jobNameOrPo",
        };
        return mapping[corr] === lastAskedSlot || corr === lastAskedSlot;
      });
      
      if (wasCorrected) {
        // PHASE 1: Acknowledge correction once (user explicitly corrected us)
        acknowledgment = getAcknowledgment(lastAskedSlot, slotValue, newDraft);
        if (acknowledgment) {
          acknowledgment = `Got it — ${acknowledgment.toLowerCase()}`;
        }
        // PHASE 2: Ensure corrected value is in draftPatch (should already be from slot tracking above)
        if (process.env.NODE_ENV === "development" && slotValue) {
          const slotKey = lastAskedSlot === "neededBy" ? "needBy" : 
                          lastAskedSlot === "addressZip" ? "deliveryAddress" :
                          lastAskedSlot === "delivery" ? "fulfillmentType" :
                          lastAskedSlot;
          if (!(slotKey in draftPatch) && !(lastAskedSlot in draftPatch)) {
            console.warn(`[PHASE2_AUDIT] Acknowledged ${lastAskedSlot} but value not in draftPatch`, {
              slotValue,
              draftPatchKeys: Object.keys(draftPatch),
            });
          }
        }
      } else if (!oldSlotValue && slotValue) {
        // PHASE 1: Only acknowledge if slot was JUST filled (was empty, now has value)
        // This is the first time we're seeing this value - acknowledge once
        acknowledgment = getAcknowledgment(lastAskedSlot, slotValue, newDraft);
        // PHASE 2: Ensure newly filled value is in draftPatch (should already be from extraction above)
        if (process.env.NODE_ENV === "development" && slotValue) {
          const slotKey = lastAskedSlot === "neededBy" ? "needBy" : 
                          lastAskedSlot === "addressZip" ? "deliveryAddress" :
                          lastAskedSlot === "delivery" ? "fulfillmentType" :
                          lastAskedSlot;
          if (!(slotKey in draftPatch) && !(lastAskedSlot in draftPatch)) {
            console.warn(`[PHASE2_AUDIT] Acknowledged ${lastAskedSlot} but value not in draftPatch`, {
              slotValue,
              draftPatchKeys: Object.keys(draftPatch),
            });
          }
        }
      }
      // PHASE 1 RULE: If slot already had a value, do NOT acknowledge again (never restate)
    }
    
    // If follow-up already provided a response, use it
    if (followUpResponse) {
      const intakeState = getIntakeState(newDraft, lastAskedSlot);
      const latency = Date.now() - startTime;
      console.log(`[AGENT_TURN] ${requestId} Procurement follow-up | userId=${user.id} | latency=${latency}ms | mode=${finalMode} | slot=${lastAskedSlot}`);
      
      // CRITICAL: Always include message hash in draftPatch to prevent re-processing
      const finalDraftPatch = {
        ...draftPatch,
        __lastAskedSlot: intakeState.nextSlot || undefined,
        __lastUserMessageHash: messageHash, // Mark this message as processed
      };
      
      return NextResponse.json({
        ok: true,
        mode: "procurement",
        assistantText: followUpResponse,
        draftPatch: finalDraftPatch,
        missing: intakeState.missingFields,
        ready: intakeState.ready,
        debug: {
          provider: finalMode === "llm" ? "openai" : "offline",
          offline: finalMode !== "llm",
          reason: finalMode !== "llm" ? offlineReason : undefined,
        },
      });
    }
    
    // Get OSR intake state (determines next question)
    const intakeState = getIntakeState(newDraft, lastAskedSlot);
    
    // MEMORY CHECK: If lineItems is already filled, don't ask for it again
    const hasLineItems = Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0;
    const lineItemsValid = hasLineItems && (updatedDraft.lineItems as Array<unknown>).every((item: any) => {
      const qtyOk = typeof item?.quantity === "number" && item.quantity > 0;
      const uomOk = !!(item?.uom?.toString().trim() || item?.unit?.toString().trim());
      const descOk = !!(item?.sku?.toString().trim() || item?.description?.toString().trim() || item?.name?.toString().trim());
      return qtyOk && uomOk && descOk;
    });
    
    // If lineItems is valid, remove it from missing fields
    if (lineItemsValid && intakeState.missingFields.includes("lineItems")) {
      intakeState.missingFields = intakeState.missingFields.filter(f => f !== "lineItems");
      // Recompute intake state if lineItems was the next slot
      if (intakeState.nextSlot === "lineItems") {
        const recomputedState = getIntakeState(newDraft, lastAskedSlot);
        intakeState.nextSlot = recomputedState.nextSlot;
        intakeState.nextQuestion = recomputedState.nextQuestion;
        intakeState.ready = recomputedState.ready;
      }
    }
    
    // LOG: Computed missing fields and next slot
    if (process.env.NODE_ENV === "development") {
      console.log(`[AGENT_TURN] ${requestId} COMPUTED_STATE`, {
        missingFields: intakeState.missingFields,
        nextSlot: intakeState.nextSlot,
        ready: intakeState.ready,
        hasLineItems,
        lineItemsValid,
        lineItemsCount: hasLineItems ? (updatedDraft.lineItems as Array<unknown>).length : 0,
        lastAskedSlot,
      });
    }
    
    // Step 8e: Build conversational response
    let assistantText: string;
    
    if (intakeState.ready) {
      // Ready: provide summary with memory-implied language
      // PHASE 1: Don't restate every detail - just confirm we're ready
      assistantText = `Based on what you told me, I've got everything I need. Want me to get pricing on this?`;
    } else {
      // Not ready: use OSR question (already includes memory prefix)
      // PHASE 1: If we have an acknowledgment, combine it with the next question
      // But only acknowledge once - never restate known facts in subsequent questions
      if (acknowledgment) {
        // Acknowledge once, then ask next question
        assistantText = `${acknowledgment} ${intakeState.nextQuestion}`;
      } else {
        // No acknowledgment needed - just ask next question (memory prefix already included)
        assistantText = intakeState.nextQuestion;
      }
    }
    
    // Ensure we always have assistantText (non-negotiable)
    if (!assistantText || assistantText.trim().length === 0) {
      // Last-ditch safeguard (should never happen)
      const { question } = getOSRQuestion(newDraft, lastAskedSlot);
      assistantText = question;
    }
    
    const latency = Date.now() - startTime;
    console.log(`[AGENT_TURN] ${requestId} Procurement ${intakeState.ready ? "ready" : "intake"} | userId=${user.id} | latency=${latency}ms | mode=${finalMode} | missingFields=${intakeState.missingFields.length} | nextSlot=${intakeState.nextSlot}`);

    // LOG: Outgoing draftPatch
    if (process.env.NODE_ENV === "development") {
      console.log(`[AGENT_TURN] ${requestId} OUTGOING_DRAFT_PATCH`, {
        draftPatchKeys: Object.keys(draftPatch),
        hasLineItems: Array.isArray(draftPatch.lineItems) && draftPatch.lineItems.length > 0,
        lineItemsCount: Array.isArray(draftPatch.lineItems) ? draftPatch.lineItems.length : 0,
        nextSlot: intakeState.nextSlot,
      });
    }

      // CRITICAL: Always include message hash in draftPatch to prevent re-processing
      const finalDraftPatch = {
        ...draftPatch,
        __lastAskedSlot: intakeState.nextSlot || undefined,
        __lastUserMessageHash: messageHash, // Mark this message as processed
      };
      
      return NextResponse.json({
        ok: true,
        mode: "procurement",
        assistantText,
        draftPatch: finalDraftPatch,
        missing: intakeState.missingFields,
        ready: intakeState.ready,
        debug: {
          provider: finalMode === "llm" ? "openai" : "offline",
          offline: finalMode !== "llm",
          reason: finalMode !== "llm" ? offlineReason : undefined,
        },
      });
  });
}
