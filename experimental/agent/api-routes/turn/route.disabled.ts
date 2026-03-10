/**
 * Agent Turn API - Roleplay Sales Rep Behavior
 * Handles all agent conversation turns with intent-based routing
 * 
 * BEHAVIOR:
 * - ASK_INFO: Informational questions (math/coverage/conversions) answered directly without procurement interrogation
 * - PROCURE: User expresses procurement intent (order/quote/price) - runs deterministic intake
 * - PROCUREMENT: Already in procurement mode - continues slot-filling using computeProcurementStatus
 * - CONFIRM/DECLINE: Clean pricing confirmation flow
 * - ADVICE: Pure Q&A mode
 * 
 * EXPECTED CONVERSATIONS:
 * 1) "How many pieces for 100 squares of Hardie lap siding?" 
 *    → ASK_INFO: Provides calculation, offers to turn into RFQ
 * 
 * 2) "I need 100 bundles Oakridge Onyx Black pickup tomorrow"
 *    → DIRECT_ORDER: Extracts qty+product+timing, asks ONE blocking question (jobNameOrPo if missing)
 * 
 * 3) "All eligible suppliers" (after visibility question)
 *    → Follow-up handler sets visibility=broadcast, continues procurement flow
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
import { getPrisma } from "@/lib/db.server";
import { Prisma } from "@prisma/client";
import { requireThreadForUser } from "@/lib/agent/serverGuards";
import { getBaseUrl } from "@/lib/urls/baseUrl.server";
import crypto from "crypto";
import { offlineFilterRoofing, type RoofingDraft } from "@/lib/agent/offlineFilter";
// REMOVED: Legacy slot engine imports (osrQuestions.ts, AgentConversationState deleted)
import { parseLineItemsFromText } from "@/lib/agent/parseLineItems";
import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
// REMOVED: dispatchRequestToSuppliers and rfqToRequest
// Agent-created RFQs use canonical routing model (visibility + targetSupplierIds)
// Routing is handled by seller feed/direct invites system, not legacy dispatch
import { computeRfqStatus, type FieldId } from "@/lib/agent/rfqStatus";
import { detectTurnIntent, type TurnIntent } from "@/lib/agent/turnIntent";
import { computeProcurementStatus, type ProcurementFieldId } from "@/lib/agent/procurementStatus";
import { validateAgentDraftRFQ } from "@/lib/agent/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// REMOVED: Legacy follow-up handler
// import { handleSlotFollowUp } from "@/lib/agent/followUp";
import { sanitizeExtraction, type ExtractedDraft } from "@/lib/agent/sanitize";
import {
  canonicalizeDraftPatch,
  applyNormalizedPatch,
} from "@/lib/rfqDraftCanonical";
import { parseThreadState, serializeThreadState, stripLegacyDispatchKeys, getDefaultThreadState, type ThreadState } from "@/lib/threadState";
import { ADVICE_SYSTEM_PROMPT, PROCUREMENT_EXTRACTION_PROMPT, getExtractionUserMessage } from "@/lib/agent/prompts";
import { hashString, extractCategory } from "@/lib/agent/intentUtils";
import { normalizeCategoryInput } from "@/lib/categories/normalizeCategory";

const AgentTurnSchema = z.object({
  message: z.string().min(1).max(8000),
  draft: z.record(z.string(), z.unknown()).optional(),
  threadId: z.string().optional(),
  userMessageId: z.string().min(1), // Required idempotency key from client
  clientTurnId: z.string().min(1), // Stable idempotency key based on threadId + normalized message
});

// Generate request ID for logging
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Detect affirmative responses to pricing confirmation
 */
function isAffirmativeResponse(message: string): boolean {
  const lower = message.trim().toLowerCase();
  const affirmativePatterns = [
    /^(yes|yeah|yep|yup|sure|ok|okay|alright|all right)$/,
    /^(go ahead|please|do it|get pricing|get quotes?|send it|proceed)$/,
    /^(yes,? please|yeah,? please|sure,? please|go ahead,? please)$/,
    /^(yes,? get|yeah,? get|sure,? get|please get)/,
  ];
  return affirmativePatterns.some(pattern => pattern.test(lower));
}

/**
 * Detect pricing confirmation messages
 * Returns true for normalized strings like: yes, yeah, yup, ok, okay, go ahead, do it, please, get pricing, send it, send this, send to suppliers, send to my preferred supplier
 */
function isPricingConfirmation(msg: string): boolean {
  const norm = (msg || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")   // strip punctuation (—, ., etc.)
    .replace(/\s+/g, " ")
    .trim();

  // quick yes/ok at the start
  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|all right)\b/.test(norm)) return true;

  // common intent phrases anywhere
  const phrases = [
    "go ahead",
    "do it",
    "proceed",
    "send it",
    "send this",
    "send it out",
    "send this out",
    "send",
    "get pricing",
    "get quotes",
    "price it",
    "quote it",
    "send to suppliers",
    "send to preferred",
    "send to my preferred",
    "preferred supplier",
    "preferred suppliers",
  ];

  return phrases.some(p => norm.includes(p));
}

/**
 * Check if message contains procurement intent
 */
function isProcurementIntent(message: string): boolean {
  const lower = message.toLowerCase();
  
  // Procurement intent words
  const procurementWords = [
    "price", "pricing", "quote", "bid", "rfq", "order", "buy", 
    "need materials", "send to suppliers", "how much", "cost", 
    "lead time", "delivery", "pickup"
  ];
  
  if (procurementWords.some(word => lower.includes(word))) {
    return true;
  }
  
  // Quantities with material terms
  const quantityPattern = /\b\d+\s*(bundles|squares|pcs|pieces|sheets|bags|ft|feet|lf|linear feet)\b/i;
  if (quantityPattern.test(message)) {
    return true;
  }
  
  // "I need" + material + quantity
  if (/^i\s+need\s+.*\b\d+\s*(bundles|squares|pcs|pieces|sheets|bags|ft|feet|lf|linear feet|shingles|siding|lumber|materials)\b/i.test(message)) {
    return true;
  }
  
  return false;
}

/**
 * Check if message is a simple product question (not procurement)
 */
function isSimpleProductQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  
  // Simple question patterns
  const questionPatterns = [
    /\bhow\s+long\b/i,
    /\bhow\s+many\b/i,
    /\bwhat\s+is\b/i,
    /\bwhat's\b/i,
    /\bdo\s+i\s+need\b/i,
    /\bdifference\s+between\b/i,
    /\bsize\s+of\b/i,
    /\blength\s+of\b/i,
  ];
  
  const hasQuestionPattern = questionPatterns.some(pattern => pattern.test(message));
  
  // Must NOT contain procurement intent
  const hasProcurementIntent = isProcurementIntent(message);
  
  return hasQuestionPattern && !hasProcurementIntent;
}

/**
 * Format a Date object as ISO date string (YYYY-MM-DD) in a specific timezone
 * Uses America/Chicago timezone by default to avoid UTC timezone issues
 */
function formatISODateInTZ(date: Date, timeZone = "America/Chicago"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Parse relative date strings like "tomorrow", "today", "ASAP" to ISO date string
 * Matches relative dates anywhere in the string (not just exact match)
 * Uses America/Chicago timezone to avoid UTC timezone issues
 */
function parseRelativeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const lower = dateStr.toLowerCase();
  const now = new Date();
  
  // Match "tomorrow" anywhere in string with word boundaries
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatISODateInTZ(tomorrow); // YYYY-MM-DD in America/Chicago
  }
  
  // Match "today" anywhere in string with word boundaries
  if (/\btoday\b/.test(lower)) {
    return formatISODateInTZ(now); // YYYY-MM-DD in America/Chicago
  }
  
  // Match "ASAP" or "asap"
  if (/\basap\b/i.test(lower)) {
    return formatISODateInTZ(now); // YYYY-MM-DD in America/Chicago
  }
  
  // Match "next [day of week]"
  const nextDayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextDayMatch) {
    const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = daysOfWeek.indexOf(nextDayMatch[1]);
    const currentDay = now.getDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7; // If today is the target day, go to next week
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return formatISODateInTZ(nextDate);
  }
  
  // Match day names directly (e.g., "friday", "next friday")
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const dayName of dayNames) {
    if (new RegExp(`\\b${dayName}\\b`).test(lower)) {
      const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const targetDay = daysOfWeek.indexOf(dayName);
      const currentDay = now.getDay();
      let daysToAdd = (targetDay - currentDay + 7) % 7;
      if (daysToAdd === 0) daysToAdd = 7;
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + daysToAdd);
      return formatISODateInTZ(nextDate);
    }
  }
  
  // Next week -> add 7 days
  if (/\bnext\s+week\b/.test(lower)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatISODateInTZ(nextWeek);
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
 * Get question for a field (simple, no slot engine dependencies)
 * Maps FieldId/ProcurementFieldId to question text
 */
function getQuestionForField(fieldId: string | null): string {
  if (!fieldId) return "";
  
  switch (fieldId) {
    case "jobNameOrPo":
      return "What's the job name or PO number?";
    case "lineItems":
      return "What materials do you need? Include quantities and units.";
    case "needBy":
      return "When do you need the materials by?";
    case "fulfillmentType":
      return "Do you need delivery to the job site, or will you pick up?";
    case "deliveryAddress":
      return "What's the delivery address or ZIP code for the job site?";
    case "categoryId":
      return "What category is this job?";
    case "visibility":
      return "Who should I send this to for pricing — your preferred suppliers only, or all eligible suppliers?";
    default:
      return `I need more information about ${fieldId}.`;
  }
}

async function getQuestionForFieldEnhanced(
  prisma: ReturnType<typeof getPrisma>,
  fieldId: string | null
): Promise<string> {
  if (!fieldId) return "";

  if (fieldId === "visibility") {
    const eligible = await prisma.supplier.findMany({
      where: { category: "ROOFING", city: "Huntsville", state: "AL" },
      orderBy: { name: "asc" },
      select: { name: true },
    });

    const base = "Everything looks good. Send to (A) preferred suppliers only or (B) all eligible suppliers?";
    if (eligible.length === 0) return base;

    return (
      base +
      "\n\n" +
      `Eligible ROOFING suppliers in Huntsville: ${eligible.map(s => s.name).join(", ")}.`
    );
  }

  return getQuestionForField(fieldId);
}

function isLineItemsDoneMessage(message: string): boolean {
  const m = (message || "").trim().toLowerCase();
  return (
    m === "nothing else" ||
    m === "nothing else." ||
    m === "that's everything" ||
    m === "that's everything" ||
    m === "that's all" ||
    m === "that's all" ||
    m === "no more" ||
    m === "no more." ||
    m === "nope" ||
    m === "no" ||
    m === "no."
  );
}

function nextQuestionFromDraft(draft: any): string | null {
  // NOTE: Keep this order aligned with your readiness gate.
  if (!draft?.jobNameOrPo) return "jobNameOrPo";
  if (!draft?.lineItems || !Array.isArray(draft.lineItems) || draft.lineItems.length === 0) return "lineItems";
  if (!draft?.needBy) return "needBy";

  const fulfillment = String(draft?.fulfillmentType || "").toUpperCase();
  if (!fulfillment) return "fulfillmentType";
  if (fulfillment === "DELIVERY") {
    const addr = draft?.deliveryAddress ? String(draft.deliveryAddress).trim() : "";
    if (!addr) return "deliveryAddress";
  }

  if (!draft?.categoryId) return "categoryId";
  if (!draft?.visibility) return "visibility";
  return null;
}

function parseVisibilityAnswer(message: string): "broadcast" | "direct" | null {
  const raw = (message || "").trim().toLowerCase();

  // Support A/B shortcuts
  if (raw === "a") return "direct";
  if (raw === "b") return "broadcast";

  // Preferred/direct intent
  if (/\b(preferred|my preferred|preferred suppliers?)\b/i.test(raw)) return "direct";

  // Broadcast intent
  if (/\b(all eligible|broadcast|everyone|all suppliers?)\b/i.test(raw)) return "broadcast";

  return null;
}

/**
 * Safe, read-only supplier lookup for agent
 * Does not dispatch, email, or modify RFQs
 */
async function lookupSuppliersForAgent(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    category?: string;
    city?: string;
    state?: string;
    nameContains?: string;
  }
) {
  const {
    category = "ROOFING",
    city = "Huntsville",
    state = "AL",
    nameContains,
  } = params;

  return prisma.supplier.findMany({
    where: {
      category: category.toUpperCase(),
      city,
      state: state.toUpperCase(),
      ...(nameContains
        ? { name: { contains: nameContains, mode: "insensitive" } }
        : {}),
    },
    orderBy: { name: "asc" },
    select: {
      name: true,
      phone: true,
      email: true,
      street: true,
      city: true,
      state: true,
      zip: true,
    },
  });
}

/**
 * Resolve category input to canonical CategoryId key
 * Handles labels, keys, and loose matches to ensure categoryId is always a valid key in categoryIdToLabel
 */
function resolveCategoryKey(input: unknown): CategoryId | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Already a valid key
  if ((raw as any) in categoryIdToLabel) return raw as CategoryId;

  const lowered = raw.toLowerCase();

  // Exact label match
  for (const [key, label] of Object.entries(categoryIdToLabel)) {
    if (String(label).toLowerCase() === lowered) return key as CategoryId;
  }

  // Loose contains match
  for (const [key, label] of Object.entries(categoryIdToLabel)) {
    const l = String(label).toLowerCase();
    if (l.includes(lowered) || lowered.includes(l)) return key as CategoryId;
  }

  return null;
}

/**
 * Sanitize inline info answers in PROCUREMENT mode
 * Removes follow-up questions, trims whitespace, and caps length
 * to keep answers short and factual (1-2 sentences max) without interrupting procurement flow
 */
function sanitizeInlineInfoAnswer(text: string): string {
  if (!text) return "";
  let t = String(text);
  // remove any sentence containing '?'
  t = t
    .split(/(?<=[.!?])\s+/)
    .filter(s => !s.includes("?"))
    .join(" ");
  // collapse whitespace
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  // hard cap
  if (t.length > 600) t = t.slice(0, 597).trimEnd() + "...";
  return t;
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

/**
 * Canonical slot alias mapping
 * Maps legacy aliases to canonical keys
 */
// NOTE: Legacy SLOT_ALIASES and canonicalizeDraft removed
// All canonicalization now uses authoritative module: @/lib/rfqDraftCanonical

/**
 * Enforce canonical draft keys IMMEDIATELY before persistence
 * CRITICAL: This is the SINGLE source of truth for canonical enforcement
 * Must be called IMMEDIATELY before ANY prisma.agentThread.update() that persists draft
 * 
 * NOTE: This function now delegates to the authoritative canonicalization module
 */
function enforceCanonicalDraft(d: Record<string, any>): Record<string, any> {
  // Handle timeline.needByDate if present (extract before canonicalization)
  if (d.timeline && typeof d.timeline === "object") {
    const t = d.timeline as any;
    if (t.needByDate && !d.needBy && !(d as any).neededBy && !d.requestedDate && !d.requested_date) {
      d.needBy = t.needByDate; // needBy is canonical, canonicalizeDraftPatch will keep it
    }
    delete d.timeline;
  }

  // Use authoritative canonicalization module
  const normalized = canonicalizeDraftPatch(d, { log: process.env.NODE_ENV === "development" });
  
  // Remove legacy dispatch keys (they belong in ThreadState, not draft)
  stripLegacyDispatchKeys(normalized);

  return normalized;
}

/**
 * Validate email address - used for extracting emails from messages to store in ThreadState.dispatch.sendTo
 */
function isValidEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Persist messages and draftPatch to thread
 * Helper function to ensure all successful turns are persisted
 * CRITICAL: Loads thread fresh from DB, does not rely on passed-in state
 */
async function persistTurn(
  threadId: string | undefined,
  userMessageId: string,
  message: string,
  assistantText: string,
  clientTurnId: string,
  draftPatch: Record<string, unknown>,
  userId: string,
  requestId: string,
  statePatch?: Partial<ThreadState> | null
): Promise<{ ok: boolean; error?: string }> {
  if (!threadId) {
    // No thread to persist to - this is OK for new threads
    return { ok: true };
  }
  
  const prisma = getPrisma();
  
  try {
    // 1) Load thread fresh from DB (including state)
    const thread = await prisma.agentThread.findUnique({
      where: { id: threadId },
      select: { id: true, userId: true, messages: true, draft: true, state: true } as any, // state column exists in schema
    });
    
    if (!thread) {
      return { ok: false, error: "Thread not found" };
    }
    
    if (thread.userId !== userId) {
      return { ok: false, error: "Forbidden" };
    }
    
    // 2) Parse messages/draft with try/catch fallback
    let messages: any[] = [];
    try {
      messages = thread.messages ? JSON.parse(thread.messages) : [];
    } catch {
      messages = [];
    }
    
    let threadDraft: Record<string, unknown> = {};
    try {
      threadDraft = thread.draft ? JSON.parse(thread.draft) : {};
    } catch {
      threadDraft = {};
    }
    
    // 2a) Canonicalize threadDraft BEFORE merge (ensures legacy keys are removed)
    // Use authoritative canonicalization module
    const normalizedThreadDraft = canonicalizeDraftPatch(threadDraft, {
      threadId,
      log: process.env.NODE_ENV === "development",
    });
    threadDraft = applyNormalizedPatch({}, normalizedThreadDraft);
    
    // 3) Append USER message with deterministic id, idempotent
    const deterministicUserMessageId = `user:${threadId}:${userMessageId}`;
    const existingUserMessage = messages.find((m: any) => m.id === deterministicUserMessageId);
    if (!existingUserMessage) {
      const userMessage = {
        id: deterministicUserMessageId,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
        inReplyTo: null,
        userId: userId,
        // DO NOT store clientTurnId on user messages
      };
      messages = [...messages, userMessage];
    }
    
    // 4) Append ASSISTANT message with deterministic id, idempotent
    const deterministicAssistantMessageId = `assistant:${threadId}:${userMessageId}`;
    const existingAssistantMessage = messages.find((m: any) => m.id === deterministicAssistantMessageId);
    if (!existingAssistantMessage) {
      const assistantMessage = {
        id: deterministicAssistantMessageId,
        role: "assistant",
        content: assistantText,
        timestamp: new Date().toISOString(),
        inReplyTo: deterministicUserMessageId, // Link to deterministic user message ID
        clientTurnId: clientTurnId, // Preserve clientTurnId on assistant messages for idempotency
        userId: userId,
      };
      messages = [...messages, assistantMessage];
    }
    
    // 5) Apply draftPatch using authoritative canonicalization module
    // State machine fields (mode, phase, progress, dispatch) are stored in state, not draft
    // The canonicalization module handles legacy key mapping and whitelisting
    const normalizedPatch = canonicalizeDraftPatch(draftPatch, {
      threadId,
      log: process.env.NODE_ENV === "development",
    });
    
    // 5b) Remove legacy dispatch keys (they belong in ThreadState, not draft)
    stripLegacyDispatchKeys(normalizedPatch);
    
    // 6) Merge normalizedPatch into draft
    let updatedDraft = { ...threadDraft, ...normalizedPatch };
    
    // 6a) Final cleanup: explicitly remove legacy keys (defensive)
    delete (updatedDraft as any).neededBy; // neededBy is alias, needBy is canonical
    delete updatedDraft.delivery;
    delete updatedDraft.addressZip;
    delete updatedDraft.requestedDate;
    delete updatedDraft.requested_date;
    delete updatedDraft.location;
    delete updatedDraft.address;
    delete updatedDraft.delivery_address;
    
    // 6b) Remove undefined/null/empty string values (keep arrays/objects)
    for (const key in updatedDraft) {
      const value = updatedDraft[key];
      if (value === undefined || value === null || (typeof value === "string" && value === "")) {
        delete updatedDraft[key];
      }
    }
    
    // 6c) FINAL ENFORCEMENT: Guarantee canonical keys IMMEDIATELY before persistence
    // CRITICAL: This must happen AFTER all normalization logic and IMMEDIATELY BEFORE prisma.agentThread.update()
    // Use the single canonical enforcement function
    enforceCanonicalDraft(updatedDraft);
    
    // 6d) Process statePatch if provided - CRITICAL: Dispatch status must be persisted to ThreadState
    let updatedState: ThreadState | null = null;
    if (statePatch) {
      // Parse existing state
      const existingState = parseThreadState((thread as any).state);
      // Use getDefaultThreadState() as base to ensure all required fields are present
      const base = existingState ?? getDefaultThreadState();
      // Deep merge statePatch into existing state
      updatedState = {
        ...base,
        mode: statePatch.mode ?? base.mode,
        phase: statePatch.phase ?? base.phase ?? null,
        progress: {
          ...base.progress,
          ...(statePatch.progress || {}),
        },
        dispatch: {
          ...base.dispatch,
          ...(statePatch.dispatch || {}),
        },
      };
      
      if (process.env.NODE_ENV === "development") {
        console.log("[AGENT_TURN_STATE_PATCH]", {
          threadId,
          statePatch,
          updatedState: updatedState.dispatch,
        });
      }
    }
    
    // Dev log before persistence
    if (process.env.NODE_ENV === "development") {
      console.log("[AGENT_TURN_PERSIST_PRE]", {
        threadId,
        keys: Object.keys(updatedDraft),
        needBy: updatedDraft.needBy,
        visibility: updatedDraft.visibility,
        statePatch: statePatch ? Object.keys(statePatch) : null,
        dispatchStatus: updatedState?.dispatch?.status,
      });
    }
    
    // 7) Persist to database (draft + state)
    await prisma.agentThread.update({
      where: { id: threadId },
      data: {
        messages: JSON.stringify(messages),
        draft: JSON.stringify(updatedDraft),
        ...(updatedState ? { state: serializeThreadState(updatedState) } : {}),
        updatedAt: new Date(),
      },
    });
    
    // 8) DEV log right after persistence
    if (process.env.NODE_ENV === "development") {
      console.log("[AGENT_TURN_PERSIST_OK]", {
        threadId,
        messagesCount: messages.length,
        draftKeys: Object.keys(updatedDraft),
      });
    }
    
    return { ok: true };
  } catch (error) {
    // 9) If update throws, DO NOT swallow. In dev, return error details
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error(`[AGENT_TURN] ${requestId} PERSISTENCE_FAILED`, {
      threadId,
      error: errorMessage,
      stack: errorStack,
    });
    
    // In dev, return detailed error
    if (process.env.NODE_ENV === "development") {
      return { ok: false, error: errorMessage };
    }
    
    // In production, return generic error
    return { ok: false, error: "Persistence failed" };
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

    // Step 2a: Verify activeRole is BUYER (agent only works for buyers)
    if (user.activeRole !== "BUYER") {
      console.error("[AGENT_TURN_ROLE_ERROR]", {
        userId: user.id,
        activeRole: user.activeRole,
        message: "Agent turn requires BUYER activeRole",
      });
      return jsonError(
        "FORBIDDEN",
        `Agent is only available for BUYER accounts. You are currently logged in as ${user.activeRole}. Please switch to BUYER role.`,
        403
      );
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

    const { message, draft, threadId, userMessageId, clientTurnId } = bodyValidation.data;
    const currentDraft = (draft as Record<string, unknown>) || {};

    // CRITICAL: Load thread with ownership enforcement BEFORE any processing
    // This ensures we have the canonical thread state for idempotency checks and persistence
    let thread: { id: string; userId: string; messages: string; draft: string; meta: string | null; title: string | null } | null = null;
    let messages: any[] = [];
    let threadDraft: Record<string, unknown> = {};
    let threadState: ThreadState | null = null;
    
    // CRITICAL: Track state updates separately from draft
    // Dispatch status must be written to ThreadState, NOT to draft
    // Declare at function level so it's accessible throughout
    let statePatch: Partial<ThreadState> | null = null;
    
    if (threadId) {
      const prisma = getPrisma();
      try {
        // Load thread - use requireThreadForUser for ownership check, then load state separately
        const result = await requireThreadForUser(prisma, threadId, user.id);
        thread = result;
        
        // Load state separately (Prisma types don't include it yet, but field exists in DB)
        const threadWithState = await prisma.$queryRaw<Array<{ state: string | null }>>`
          SELECT state FROM "AgentThread" WHERE id = ${threadId} AND "userId" = ${user.id}
        `;
        const threadStateRaw = threadWithState[0]?.state || null;
        
        // Parse existing thread state
        try {
          messages = thread.messages ? JSON.parse(thread.messages) : [];
        } catch {
          messages = [];
        }
        
        try {
          threadDraft = thread.draft ? JSON.parse(thread.draft) : {};
        } catch {
          threadDraft = {};
        }
        
        // Parse thread state (authoritative source for dispatch status)
        threadState = parseThreadState(threadStateRaw);
        
        // Merge currentDraft with threadDraft (threadDraft is canonical)
        Object.assign(currentDraft, threadDraft);
        
        // Mode comes ONLY from threadState.mode (no keyword heuristics)
        // If undefined, default to ADVICE
        if (!threadState?.mode) {
          threadState = {
            ...threadState,
            mode: "ADVICE" as const,
          };
        }
      } catch (error: any) {
        // requireThreadForUser throws NextResponse for errors
        if (error instanceof NextResponse) {
          return error;
        }
        // If thread lookup fails, continue processing (don't block on DB errors)
        if (process.env.NODE_ENV === "development") {
          console.warn(`[AGENT_TURN] ${requestId} Thread lookup failed, continuing`, error);
        }
      }
    }

    // CRITICAL: True idempotency - check thread.messages for existing assistant message
    // Only assistant messages indicate a completed turn
    if (thread && messages.length > 0) {
      // Check if assistant message with this clientTurnId already exists (primary check)
      const existingAssistantByClientTurnId = messages.find((m: any) =>
        m?.role === "assistant" && m?.clientTurnId === clientTurnId
      );
          
          if (existingAssistantByClientTurnId) {
            // Turn already processed (assistant response exists) — return noop response with preserved hash
            if (process.env.NODE_ENV === "development") {
              console.log(`[AGENT_TURN] ${requestId} DUPLICATE_CLIENT_TURN_BLOCKED (assistant message exists)`, {
                threadId,
                clientTurnId,
                userMessageId,
                messagePreview: message.substring(0, 50),
                assistantMessageId: existingAssistantByClientTurnId.id,
              });
            }

            // Use computeRfqStatus to get next question (single authority)
            const statusDup = computeRfqStatus({ draft: currentDraft, threadState });
            let assistantTextForDuplicate = "";
            if (!statusDup.isReadyToConfirm && statusDup.nextQuestionId) {
              const prisma = getPrisma();
              assistantTextForDuplicate = await getQuestionForFieldEnhanced(prisma, statusDup.nextQuestionId);
            } else {
              const dispatchStatus = threadState?.dispatch?.status;
              if (dispatchStatus === "DISPATCHED") {
                assistantTextForDuplicate = "Already sent — waiting on bids.";
              } else if (dispatchStatus === "CONFIRMED" || dispatchStatus === "DISPATCHING") {
                assistantTextForDuplicate = "Got it — I sent this out for pricing. I'll notify you as quotes arrive.";
              } else if (statusDup.isReadyToConfirm) {
                assistantTextForDuplicate = "Want me to send this out for pricing now?";
              } else {
                assistantTextForDuplicate = "What else do you need?";
              }
            }
            
            // Return existing assistant message and current draft
            return NextResponse.json({
              ok: true,
              mode: "procurement",
              assistantText: assistantTextForDuplicate,
              draftPatch: {},
              debug: { duplicate: true }
            });
          }

      // Secondary check: Check if assistant message for this userMessageId already exists
      // Deterministic assistant message ID: assistant:${threadId}:${userMessageId}
      const assistantMessageId = `assistant:${threadId}:${userMessageId}`;
      const existingAssistantByUserMessageId = messages.find((m: any) =>
        m?.role === "assistant" &&
        (m?.id === assistantMessageId || m?.inReplyTo === userMessageId)
      );
      
      if (existingAssistantByUserMessageId) {
            // Turn already processed (assistant response exists) — return noop response
            if (process.env.NODE_ENV === "development") {
              console.log(`[AGENT_TURN] ${requestId} DUPLICATE_MESSAGE_ID_BLOCKED (assistant message exists)`, {
                assistantMessageId,
                threadId,
                userMessageId,
                messagePreview: message.substring(0, 50),
              });
            }

            // Use computeRfqStatus to get next question (single authority)
            const status = computeRfqStatus({ draft: currentDraft, threadState });
            let assistantTextForDuplicate2 = "";
            if (!status.isReadyToConfirm && status.nextQuestionId) {
              const prisma = getPrisma();
              assistantTextForDuplicate2 = await getQuestionForFieldEnhanced(prisma, status.nextQuestionId);
            } else {
              const dispatchStatus2 = threadState?.dispatch?.status;
              if (dispatchStatus2 === "DISPATCHED") {
                assistantTextForDuplicate2 = "Already sent — waiting on bids.";
              } else if (dispatchStatus2 === "CONFIRMED" || dispatchStatus2 === "DISPATCHING") {
                assistantTextForDuplicate2 = "Got it — I sent this out for pricing. I'll notify you as quotes arrive.";
              } else if (status.isReadyToConfirm) {
                assistantTextForDuplicate2 = "Want me to send this out for pricing now?";
              } else {
                assistantTextForDuplicate2 = "What else do you need?";
              }
            }
            
        // Return existing assistant message and current draft
        return NextResponse.json({
          ok: true,
          mode: "procurement",
          assistantText: assistantTextForDuplicate2,
          draftPatch: {},
          debug: { duplicate: true }
        });
      }
    }

    // CRITICAL: Early idempotency guard using userMessageId from draft (BEFORE any processing)
    // This is a secondary check for cases where threadId is not provided
    const lastMessageId = currentDraft.__lastUserMessageId as string | undefined;
    
    if (lastMessageId === userMessageId) {
      // Message already processed — return noop cached response
      // Use computeRfqStatus to get next question (single authority)
      const status3 = computeRfqStatus({ draft: currentDraft, threadState });
      let assistantTextForDuplicate3 = "";
      if (!status3.isReadyToConfirm && status3.nextQuestionId) {
        const prisma = getPrisma();
        assistantTextForDuplicate3 = await getQuestionForFieldEnhanced(prisma, status3.nextQuestionId);
      } else {
        const dispatchStatus3 = threadState?.dispatch?.status;
        if (dispatchStatus3 === "DISPATCHED") {
          assistantTextForDuplicate3 = "Already sent — waiting on bids.";
        } else if (dispatchStatus3 === "CONFIRMED" || dispatchStatus3 === "DISPATCHING") {
          assistantTextForDuplicate3 = "Got it — I sent this out for pricing. I'll notify you as quotes arrive.";
        } else if (status3.isReadyToConfirm) {
          assistantTextForDuplicate3 = "Want me to send this out for pricing now?";
        } else {
          assistantTextForDuplicate3 = "What else do you need?";
        }
      }
      
      return NextResponse.json({
        ok: true,
        mode: "procurement",
        assistantText: assistantTextForDuplicate3,
        draftPatch: {},
        debug: { duplicate: true }
      });
    }

    // CRITICAL: Persist idempotency marker IMMEDIATELY before any processing
    // This guarantees that concurrent requests cannot both process
    currentDraft.__lastUserMessageId = userMessageId;

    // CRITICAL: Prevent re-processing the same message (secondary guard using hash)
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
      // Use computeRfqStatus to get next question (single authority)
      const status4 = computeRfqStatus({ draft: currentDraft, threadState });
      let assistantTextForDuplicate4 = "";
      if (!status4.isReadyToConfirm && status4.nextQuestionId) {
        const prisma = getPrisma();
        assistantTextForDuplicate4 = await getQuestionForFieldEnhanced(prisma, status4.nextQuestionId);
      } else {
        const dispatchStatus4 = threadState?.dispatch?.status;
        if (dispatchStatus4 === "DISPATCHED") {
          assistantTextForDuplicate4 = "Already sent — waiting on bids.";
        } else if (dispatchStatus4 === "CONFIRMED" || dispatchStatus4 === "DISPATCHING") {
          assistantTextForDuplicate4 = "Got it — I sent this out for pricing. I'll notify you as quotes arrive.";
        } else if (status4.isReadyToConfirm) {
          assistantTextForDuplicate4 = "Want me to send this out for pricing now?";
        } else {
          assistantTextForDuplicate4 = "What else do you need?";
        }
      }
      
      return NextResponse.json({
        ok: true,
        mode: "procurement",
        assistantText: assistantTextForDuplicate4,
        draftPatch: {},
        missing: status4.missingRequired,
        ready: status4.isReadyToConfirm,
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
        needBy: currentDraft.needBy,
        messageHash,
        lastProcessedHash,
      });
    }

    // Mode comes ONLY from threadState.mode (no inference from message or draft)
    const currentMode = threadState?.mode || "ADVICE";
    
    const draftPatch: Record<string, unknown> = {
      __lastUserMessageId: userMessageId, // Persist idempotency marker immediately
    };
    
    // REMOVED: Legacy follow-up handling - extraction handles this naturally
    
    // CRITICAL: Detect preferred supplier intent from user message
    // If user says "preferred supplier", "my preferred", "only to my preferred supplier", etc.
    // Set visibility="direct" (do not require user to click anything)
    function detectPreferredSupplierIntent(msg: string): boolean {
      const lower = msg.toLowerCase();
      // Patterns: "preferred supplier", "my preferred", "preferred" + "supplier", "only" + "preferred"
      const hasPreferred = /\b(preferred\s+supplier|my\s+preferred|preferred\s+only)\b/i.test(lower);
      const hasPreferredAndSupplier = /\bpreferred\b/i.test(lower) && /\bsupplier/i.test(lower);
      const hasOnlyPreferred = /\b(only|just)\s+(?:to\s+)?(?:my\s+)?preferred/i.test(lower);
      return hasPreferred || hasPreferredAndSupplier || hasOnlyPreferred;
    }
    
    const userMessageContainsPreferred = detectPreferredSupplierIntent(message);
    
    // CRITICAL: If preferred supplier intent detected, set visibility="direct"
    if (userMessageContainsPreferred) {
      draftPatch.visibility = "direct";
      if (process.env.NODE_ENV === "development") {
        console.log(`[AGENT_PREFERRED_INTENT] ${requestId}`, {
          threadId,
          message: message.substring(0, 100),
          visibility: "direct",
        });
      }
    }
    
    // CRITICAL: Infer category from message if not set (use extractCategory from intentRouter)
    // Do NOT default to roofing - only set if explicitly inferred
    // Normalize inferred category to canonical CategoryId using normalizeCategoryInput
    if (!currentDraft.categoryId && !currentDraft.categoryLabel) {
      const inferredCategory = extractCategory(message);
      if (inferredCategory) {
        // Normalize to canonical CategoryId (handles label variations)
        const normalized = normalizeCategoryInput(inferredCategory);
        if (normalized.categoryId && normalized.categoryId in categoryIdToLabel) {
          draftPatch.categoryId = normalized.categoryId;
          draftPatch.categoryLabel = categoryIdToLabel[normalized.categoryId];
        }
      }
      // If no category inferred, leave it unset (do NOT default to roofing)
    }
    
    // IMPORTANT: Do NOT default visibility here.
    // Visibility is a user choice (preferred-only vs all eligible).
    // If missing, let the readiness gate ask.

    // CRITICAL: Detect intent BEFORE any early returns
    // This ensures PROCURE intent can flip mode even when currentMode is ADVICE
    let updatedDraft = { ...currentDraft };
    const currentStateMode = threadState?.mode === "PROCUREMENT" ? "procurement" : "advice";
    const intent = detectTurnIntent({
      message,
      draft: currentDraft, // Use currentDraft before updatedDraft is modified
      threadState,
      conversationMode: currentStateMode, // Pass for context only, not for veto
    });

    // SINGLE AUTHORITATIVE EXECUTION MODE: Derived once per turn, intent takes priority
    // This is the ONE brain with TWO gears (ADVICE | PROCUREMENT)
    type ExecutionMode = "ADVICE" | "PROCUREMENT";
    let executionMode: ExecutionMode;

    // Intent always wins - PROCURE intent immediately sets PROCUREMENT mode
    if (intent === "PROCURE" || intent === "PROCUREMENT" || intent === "CONFIRM") {
      executionMode = "PROCUREMENT";
    } else if (threadState?.mode === "PROCUREMENT") {
      // Resume procurement if already in procurement (preserves continuity)
      executionMode = "PROCUREMENT";
    } else {
      // Default to ADVICE
      executionMode = "ADVICE";
    }

    // Persist mode immediately when it becomes PROCUREMENT (before any response generation)
    if (executionMode === "PROCUREMENT" && threadState?.mode !== "PROCUREMENT") {
      if (!statePatch) statePatch = {};
      statePatch.mode = "PROCUREMENT";
      // Update local threadState for this turn using safe merge
      threadState = { ...(threadState ?? getDefaultThreadState()), mode: "PROCUREMENT" };
    }

    // ASK_INFO never downgrades executionMode - if in PROCUREMENT, stays in PROCUREMENT
    // (executionMode is already set above, so ASK_INFO in procurement stays procurement)

    // Step 7: Handle advice mode (only if not PROCURE intent and currentMode is ADVICE)
    // PROCURE intent skips this and proceeds to procurement flow
    // CRITICAL: Advice is side-effect free - does NOT modify draft RFQ fields
    // Advice responses never affect readiness, never block next question, never modify draft
    if (executionMode === "ADVICE" && intent !== "PROCURE" && intent !== "PROCUREMENT" && intent !== "CONFIRM") {
      let adviceAssistantText = "";
      // CRITICAL: Advice only sets idempotency keys, never RFQ fields
      // Do NOT spread draftPatch - it may contain RFQ fields from extraction
      let adviceDraftPatch = {
        __lastUserMessageId: userMessageId,
        __lastUserMessageHash: messageHash,
      };
      
      // Check for supplier lookup requests (safe, read-only)
      if (/supplier|vendor|where can i buy|who sells/i.test(message)) {
        const prisma = getPrisma();
        const suppliers = await lookupSuppliersForAgent(prisma, {});

        if (suppliers.length === 0) {
          adviceAssistantText = "I don't see any suppliers for that category in this area yet.";
        } else {
          adviceAssistantText =
            "Here are known roofing suppliers in Huntsville:\n\n" +
            suppliers
              .map(
                s =>
                  `• ${s.name}\n  ${s.street}, ${s.city}, ${s.state} ${s.zip}\n  📞 ${s.phone || "N/A"}`
              )
              .join("\n\n");
        }

        // Persist and return early (no LLM call needed)
        const persistResult = await persistTurn(
          threadId,
          userMessageId,
          message,
          adviceAssistantText,
          clientTurnId,
          adviceDraftPatch,
          user.id,
          requestId,
          statePatch
        );

        if (!persistResult.ok) {
          if (process.env.NODE_ENV === "development") {
            console.error(`[AGENT_TURN] ${requestId} Failed to persist advice turn`, persistResult.error);
          }
          return jsonError("PERSIST_FAILED", "Failed to save conversation", 500);
        }

        return NextResponse.json({
          ok: true,
          mode: "advice",
          assistantText: adviceAssistantText,
          draftPatch: adviceDraftPatch,
        });
      }
      
      if (!isAIConfigured) {
        // Offline advice mode: simple fallback
        adviceAssistantText = "I'm here to help with construction materials. What can I assist you with?";
      } else {
        // Mode A: LLM healthy for advice
        try {
          const openai = new OpenAI({ apiKey: aiConfigResult.config.apiKey });
          adviceAssistantText = await callAdviceMode(openai, message, aiConfigResult.config.model);
          
          const latency = Date.now() - startTime;
          console.log(`[AGENT_TURN] ${requestId} Advice mode | userId=${user.id} | latency=${latency}ms | mode=llm`);
        } catch (error) {
          // Mode B: LLM failing -> fallback to offline
          offlineReason = error instanceof Error ? error.message : "LLM_ERROR";
          console.error(`[AGENT_TURN] ${requestId} LLM failed, falling back to offline`, error);
          adviceAssistantText = "I'm having some technical difficulties, but I'm here to help. What can I assist you with?";
        }
      }
      
      // CRITICAL: Persist messages and draftPatch BEFORE returning
      const persistResult = await persistTurn(
        threadId,
        userMessageId,
        message,
        adviceAssistantText,
        clientTurnId,
        adviceDraftPatch,
        user.id,
        requestId,
        statePatch // Pass statePatch to persist any mode changes
      );
      
      if (!persistResult.ok) {
        if (process.env.NODE_ENV === "development") {
          return jsonError("PERSISTENCE_FAILED", persistResult.error || "Failed to persist turn", 500);
        }
        // In production, still return success but log the error
        console.error(`[AGENT_TURN] ${requestId} PERSISTENCE_FAILED (non-blocking in prod)`, persistResult.error);
      }
      
      return NextResponse.json({
        ok: true,
        mode: "advice",
        assistantText: adviceAssistantText,
        draftPatch: adviceDraftPatch,
        debug: {
          provider: isAIConfigured ? "openai" : "offline",
          offline: !isAIConfigured || !!offlineReason,
          reason: offlineReason,
        },
      });
    }

    // Step 8: Procurement mode (OSR-style intake flow)
    // Proceed if executionMode is PROCUREMENT (intent may have flipped it from ADVICE)
    // Note: intent detection and executionMode calculation already happened above

    // Step 8b: Try LLM extraction (if configured)
    let llmExtractionSucceeded = false;
    let finalMode: "llm" | "offline" | "fallback" = isAIConfigured ? "fallback" : "offline";
    
    if (isAIConfigured) {
      try {
        const openai = new OpenAI({ apiKey: aiConfigResult.config.apiKey });
        const extracted = await callProcurementExtraction(openai, message, updatedDraft, aiConfigResult.config.model);
        finalMode = "llm";
        llmExtractionSucceeded = true;
        
        // Normalize LLM extraction output using canonicalizeDraftPatch
        // This maps all aliases (neededBy → needBy, delivery → fulfillmentType, etc.) to canonical keys
        const normalizedExtraction = canonicalizeDraftPatch(extracted, {
          threadId,
          log: process.env.NODE_ENV === "development",
        });
        
        // Parse relative dates for needBy (canonical key only)
        // Check if normalizedExtraction has needBy or neededBy (normalize to needBy)
        if ((normalizedExtraction as any).needBy && typeof (normalizedExtraction as any).needBy === "string") {
          const parsedDate = parseRelativeDate((normalizedExtraction as any).needBy);
          if (parsedDate) {
            normalizedExtraction.needBy = parsedDate; // Only canonical key
            delete (normalizedExtraction as any).neededBy; // Remove alias
          }
        } else if (normalizedExtraction.neededBy && typeof normalizedExtraction.neededBy === "string") {
          const parsedDate = parseRelativeDate(normalizedExtraction.neededBy);
          if (parsedDate) {
            normalizedExtraction.needBy = parsedDate; // Only canonical key
            delete (normalizedExtraction as any).neededBy; // Remove alias
          }
        }
        // Also check if message itself contains relative dates
        const messageParsedDate = parseRelativeDate(message);
        if (messageParsedDate) {
          normalizedExtraction.needBy = messageParsedDate; // Only canonical key
          delete (normalizedExtraction as any).neededBy; // Remove alias
        }
        
        // Merge normalized extraction into updatedDraft using canonical merge
        // CRITICAL: normalizedExtraction already uses canonical keys (from AgentConversationState)
        // Do NOT set legacy aliases (neededBy, delivery, etc.) - only canonical keys
        const mergedDraft = applyNormalizedPatch(updatedDraft, normalizedExtraction);
        updatedDraft = mergedDraft;
        
        // Merge into draftPatch (CRITICAL: Always write to canonical draft)
        Object.assign(draftPatch, normalizedExtraction);
      } catch (error) {
        // Mode B: LLM failing -> fallback to offline
        finalMode = "fallback";
        offlineReason = error instanceof Error ? error.message : "LLM_ERROR";
        console.error(`[AGENT_TURN] ${requestId} LLM extraction failed, falling back to offline`, error);
      }
    }

    // Step 8c: Offline extraction (if LLM not used or failed)
    if (!llmExtractionSucceeded) {
      const lowerMessageForExtraction = message.toLowerCase();
      
      // Extract email from "Send pricing to..." messages and store in ThreadState.dispatch.sendTo
      // CRITICAL: Email addresses go to ThreadState.dispatch.sendTo, NOT to draft
      if (lowerMessageForExtraction.includes("send pricing") || lowerMessageForExtraction.includes("send this") || lowerMessageForExtraction.includes("send it")) {
        // Extract email from message
        const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
        if (emailMatch && threadState) {
          // Store email in ThreadState.dispatch.sendTo (will be persisted via statePatch)
          if (!statePatch) statePatch = {};
          if (!statePatch.dispatch) statePatch.dispatch = {};
          statePatch.dispatch.sendTo = emailMatch[0];
        }
        // If no email found, do NOT set anything (visibility will be set separately)
      }
      
      /**
       * Resolve inferred category string to canonical CategoryId key
       * Maps labels like "Drywall" to keys like "drywall" by matching against categoryIdToLabel
       */
      function resolveCategoryIdFromInferred(inferred: string | null): CategoryId | null {
        if (!inferred) return null;
        const raw = inferred.trim();
        if (!raw) return null;

        // 1) If already a valid key, accept it
        if ((raw as any) in categoryIdToLabel) return raw as CategoryId;

        const lowered = raw.toLowerCase();

        // 2) Match against labels (values of categoryIdToLabel)
        for (const [key, label] of Object.entries(categoryIdToLabel)) {
          const l = String(label).toLowerCase();
          if (l === lowered) return key as CategoryId;
        }

        // 3) Loose contains match (handles "drywall", "sheetrock", etc.)
        for (const [key, label] of Object.entries(categoryIdToLabel)) {
          const l = String(label).toLowerCase();
          if (l.includes(lowered) || lowered.includes(l)) return key as CategoryId;
        }

        return null;
      }

      // CRITICAL: Parse lineItems from message text (offline mode)
      // Only parse if lineItems is not already filled
      const hasLineItems = Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0;
      if (!hasLineItems) {
        const parsedItems = parseLineItemsFromText(message);
        if (parsedItems.length > 0) {
          updatedDraft.lineItems = parsedItems;
          draftPatch.lineItems = parsedItems;
          
          // Infer categoryId from line items if not already set
          // Use extractCategory on item descriptions and resolve to canonical key
          if (!updatedDraft.categoryId && !updatedDraft.categoryLabel) {
            // Build text blob from item descriptions
            const itemDescriptions = parsedItems
              .map(item => item.description)
              .filter(desc => desc && typeof desc === "string")
              .join(" ");
            
            if (itemDescriptions) {
              // Try extractCategory on the item descriptions
              const inferredFromItems = extractCategory(itemDescriptions);
              const resolvedKey = resolveCategoryIdFromInferred(inferredFromItems);
              
              if (resolvedKey) {
                updatedDraft.categoryId = resolvedKey;
                updatedDraft.categoryLabel = categoryIdToLabel[resolvedKey];
                draftPatch.categoryId = resolvedKey;
                draftPatch.categoryLabel = categoryIdToLabel[resolvedKey];
              }
            }
          }
          
          if (process.env.NODE_ENV === "development") {
            console.log(`[AGENT_TURN] ${requestId} PARSED_LINE_ITEMS`, {
              count: parsedItems.length,
              items: parsedItems.map(item => `${item.quantity} ${item.unit} ${item.description}`),
            });
          }
        }
      }
      
      // CRITICAL: Extract job name/PO from message (offline mode)
      // Check if user provided job name/PO
      if (lowerMessageForExtraction.match(/\b(po|p\.o\.|purchase order|job name|job:|po:)\b/i)) {
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
          if (trimmed.length > 0 && trimmed.length < 50 && !trimmed.includes(" ")) {
            updatedDraft.jobNameOrPo = trimmed;
            draftPatch.jobNameOrPo = trimmed;
          }
        }
      }
      
      // CRITICAL: Extract fulfillment type (delivery/pickup) from message (offline mode)
      // Patterns: "deliver", "delivery", "pickup", "pick up", "will call", "curbside"
      // Set fulfillmentType when intent is detected to avoid redundant questions
      // Address will be asked separately if missing
      const lowerForFulfillment = message.toLowerCase();
      if (!updatedDraft.fulfillmentType) {
        if (lowerForFulfillment.match(/\b(deliver|delivery|ship|drop\s*off|dropoff)\b/)) {
          // Delivery intent detected - set DELIVERY (address will be asked if missing)
          updatedDraft.fulfillmentType = "DELIVERY";
          draftPatch.fulfillmentType = "DELIVERY";
        } else if (lowerForFulfillment.match(/\b(pickup|pick\s+up|will\s+call|curbside|pick\s+up\s+at)\b/)) {
          updatedDraft.fulfillmentType = "PICKUP";
          draftPatch.fulfillmentType = "PICKUP";
        }
      }
      
      // CRITICAL: Extract relative dates like "tomorrow" (offline mode)
      // Use robust parsing that matches anywhere in the string
      // Only persist canonical "needBy", not "neededBy"
      const parsedDate = parseRelativeDate(message);
      if (parsedDate) {
        updatedDraft.needBy = parsedDate; // Only canonical key
        draftPatch.needBy = parsedDate; // Only canonical key
      }
      
      // Infer category from message if not already set
      // Use extractCategory and resolve to canonical CategoryId key
      if (!updatedDraft.categoryId && !updatedDraft.categoryLabel) {
        const inferredCategory = extractCategory(message);
        const resolvedKey = resolveCategoryIdFromInferred(inferredCategory);
        
        if (resolvedKey) {
          updatedDraft.categoryId = resolvedKey;
          updatedDraft.categoryLabel = categoryIdToLabel[resolvedKey];
          draftPatch.categoryId = resolvedKey;
          draftPatch.categoryLabel = categoryIdToLabel[resolvedKey];
        }
      }
      
      // Use offline filter for roofing (only if category is roofing)
      const categoryId = updatedDraft.categoryId as string | undefined;
      const categoryLabel = updatedDraft.categoryLabel as string | undefined;
      const categoryStr = categoryId || (typeof updatedDraft.category === "string" ? updatedDraft.category : categoryLabel) || "";
      if (categoryStr.toLowerCase() === "roofing" || categoryId === "roofing") {
        const offlineResult = offlineFilterRoofing(message, updatedDraft as Partial<RoofingDraft>);
        const mergedDraft = applyNormalizedPatch(updatedDraft, offlineResult.patch);
        updatedDraft = mergedDraft;
        Object.assign(draftPatch, offlineResult.patch);
      }
      
      // IMPORTANT: Do NOT default visibility to broadcast here.
      // Visibility is a user choice (preferred-only vs all eligible).
      // Only set to "direct" if user explicitly requested preferred suppliers.
      if (userMessageContainsPreferred && !updatedDraft.visibility) {
        // If preferred intent detected but visibility not set, set it to direct
        updatedDraft.visibility = "direct";
        draftPatch.visibility = "direct";
      }
    }

    // CRITICAL: Extract neededBy and deliveryAddress from user message BEFORE canonicalization
    // These helpers extract canonical fields directly from the message
    function extractNeededBy(msg: string): string | null {
      // Pattern 1: "Needed by YYYY-MM-DD" or "needed by YYYY-MM-DD"
      const neededByMatch = msg.match(/\bneeded\s+by\s+(\d{4}-\d{2}-\d{2})\b/i);
      if (neededByMatch && neededByMatch[1]) {
        return neededByMatch[1];
      }
      
      // Pattern 2: ISO date format anywhere in message (YYYY-MM-DD)
      const isoDateMatch = msg.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (isoDateMatch && isoDateMatch[1]) {
        // Validate it's a valid date
        const date = new Date(isoDateMatch[1]);
        if (!isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(isoDateMatch[1])) {
          return isoDateMatch[1];
        }
      }
      
      return null;
    }
    
    function extractDeliveryAddress(msg: string): string | null {
      // Pattern 1: "Deliver to <address>" or "delivery to <address>"
      const deliverToMatch = msg.match(/\b(?:deliver|delivery)\s+to\s+(.+?)(?:\.|,|$)/i);
      if (deliverToMatch && deliverToMatch[1]) {
        const address = deliverToMatch[1].trim();
        if (address.length > 0) {
          return address;
        }
      }
      
      // Pattern 2: ZIP code only (5 digits)
      const zipMatch = msg.match(/\b(\d{5})\b/);
      if (zipMatch && zipMatch[1]) {
        return zipMatch[1];
      }
      
      return null;
    }
    
    // Extract from user message if not already in draftPatch or currentDraft
    const extractedNeedBy = extractNeededBy(message);
    if (extractedNeedBy && !draftPatch.needBy && !currentDraft.needBy) {
      draftPatch.needBy = extractedNeedBy; // Write to canonical key
    }
    
    const extractedAddr = extractDeliveryAddress(message);
    if (extractedAddr && !draftPatch.deliveryAddress && !currentDraft.deliveryAddress) {
      draftPatch.deliveryAddress = extractedAddr.trim();
      // If deliveryAddress was extracted and fulfillmentType is not set, set it to DELIVERY
      if (!updatedDraft.fulfillmentType && !draftPatch.fulfillmentType) {
        const lowerForFulfillment = message.toLowerCase();
        if (lowerForFulfillment.match(/\b(deliver|delivery|ship|drop\s*off|dropoff)\b/)) {
          updatedDraft.fulfillmentType = "DELIVERY";
          draftPatch.fulfillmentType = "DELIVERY";
        }
      }
    }
    
    // CRITICAL: Canonicalize model-emitted aliases to canonical keys
    // Map legacy keys to canonical and delete legacy keys
    // Note: canonicalizeDraftPatch will normalize neededBy -> needBy (needBy is canonical)
    if ((draftPatch as any).neededBy && !draftPatch.needBy && !currentDraft.needBy) {
      draftPatch.needBy = (draftPatch as any).neededBy;
    }
    delete (draftPatch as any).neededBy; // Delete alias
    
    if ((draftPatch as any).terms?.requestedDate && !draftPatch.needBy && !currentDraft.needBy) {
      draftPatch.needBy = (draftPatch as any).terms.requestedDate;
    }
    
    if ((draftPatch as any).terms?.location && !draftPatch.deliveryAddress && !currentDraft.deliveryAddress) {
      draftPatch.deliveryAddress = (draftPatch as any).terms.location;
    }
    
    // Do NOT persist terms object into draft; delete it from patch if present
    delete (draftPatch as any).terms;
    delete (draftPatch as any).location;
    delete (draftPatch as any).requestedDate;
    delete (draftPatch as any).requested_date;
    
    // CRITICAL: Normalize fulfillmentType aliases to canonical values
    // Convert "delivery"/"delivered"/"deliver" => "DELIVERY" and "pickup"/"pick up" => "PICKUP"
    // Do this ONLY if fulfillmentType is not already set to a canonical value
    if (draftPatch.fulfillmentType && typeof draftPatch.fulfillmentType === "string") {
      const ft = draftPatch.fulfillmentType.trim().toLowerCase();
      if (ft.includes("deliver")) {
        draftPatch.fulfillmentType = "DELIVERY";
      } else if (ft.includes("pickup") || ft.includes("pick up")) {
        draftPatch.fulfillmentType = "PICKUP";
      } else {
        // Normalize existing canonical values to uppercase
        const upper = draftPatch.fulfillmentType.toUpperCase();
        if (upper === "PICKUP" || upper === "DELIVERY") {
          draftPatch.fulfillmentType = upper;
        }
      }
    }
    // Also normalize in updatedDraft if it exists
    if (updatedDraft.fulfillmentType && typeof updatedDraft.fulfillmentType === "string") {
      const ft = String(updatedDraft.fulfillmentType).trim().toLowerCase();
      if (ft.includes("deliver")) {
        updatedDraft.fulfillmentType = "DELIVERY";
      } else if (ft.includes("pickup") || ft.includes("pick up")) {
        updatedDraft.fulfillmentType = "PICKUP";
      } else {
        const upper = String(updatedDraft.fulfillmentType).toUpperCase();
        if (upper === "PICKUP" || upper === "DELIVERY") {
          updatedDraft.fulfillmentType = upper;
        }
      }
    }

    // CRITICAL: Enforce canonical draft after all extraction/normalization
    // This ensures all aliases are normalized to canonical keys
    enforceCanonicalDraft(updatedDraft);
    // Also canonicalize draftPatch
    const normalizedDraftPatch = canonicalizeDraftPatch(draftPatch, {
      threadId,
      log: process.env.NODE_ENV === "development",
    });
    Object.assign(draftPatch, normalizedDraftPatch);
    
    // CRITICAL: Apply draftPatch to updatedDraft to get the final canonical draft
    // This ensures missing fields are computed from the ACTUAL draft that will be persisted
    // This must happen BEFORE computing procurementStatus
    updatedDraft = applyNormalizedPatch(updatedDraft, draftPatch);
    
    // CRITICAL: After applying draft patch, ensure visibility is not overwritten if preferred intent was detected
    // If userMessageContainsPreferred was true, visibility should remain "direct" (not overwritten to "broadcast")
    // Also: do not downgrade visibility to broadcast if already direct and user didn't request broadcast
    if (userMessageContainsPreferred && updatedDraft.visibility !== "direct") {
      updatedDraft.visibility = "direct";
      draftPatch.visibility = "direct";
    } else if (updatedDraft.visibility === "direct" && !userMessageContainsPreferred) {
      // Keep "direct" if already set, unless user explicitly requests broadcast
      // (Check if message contains "broadcast" or "all eligible" intent)
      const hasBroadcastIntent = /\b(all\s+eligible|broadcast|everyone|all\s+suppliers?)\b/i.test(message);
      if (!hasBroadcastIntent) {
        // Keep "direct" - do not downgrade
        draftPatch.visibility = "direct";
      }
    }

    // ALWAYS canonicalize categoryId regardless of LLM/offline extraction
    // This ensures categoryId is always a valid key in categoryIdToLabel before computeProcurementStatus
    let resolvedCategory =
      resolveCategoryKey((updatedDraft as any).categoryId) ||
      resolveCategoryKey((updatedDraft as any).categoryLabel);

    // If still missing, infer from content
    if (!resolvedCategory) {
      const lineItems = Array.isArray((updatedDraft as any).lineItems) ? (updatedDraft as any).lineItems : [];
      const blob = lineItems.map((li: any) => String(li?.description || "")).join(" ");
      const inferred = extractCategory(blob) || extractCategory(message);
      resolvedCategory = resolveCategoryKey(inferred);
    }

    if (resolvedCategory) {
      (updatedDraft as any).categoryId = resolvedCategory;
      (updatedDraft as any).categoryLabel = categoryIdToLabel[resolvedCategory] || resolvedCategory;

      (draftPatch as any).categoryId = resolvedCategory;
      (draftPatch as any).categoryLabel = (updatedDraft as any).categoryLabel;
    }

    /**
     * Infer categoryId from draft content (deterministic, runs for both LLM and offline paths)
     * Checks lineItems descriptions, categoryLabel, and message for category signals
     */
    function inferCategoryIdFromDraft(draft: Record<string, unknown>, msg: string): CategoryId | null {
      // If categoryId already exists and is valid, return it
      if (draft.categoryId && typeof draft.categoryId === "string") {
        const existingId = draft.categoryId as string;
        if (existingId in categoryIdToLabel) {
          return existingId as CategoryId;
        }
      }
      
      // Build text blob from available sources
      const textParts: string[] = [];
      
      // Add categoryLabel if present
      if (draft.categoryLabel && typeof draft.categoryLabel === "string") {
        textParts.push(draft.categoryLabel);
      }
      
      // Add lineItems descriptions
      if (Array.isArray(draft.lineItems)) {
        for (const item of draft.lineItems) {
          if (item && typeof item === "object" && "description" in item) {
            const desc = item.description;
            if (typeof desc === "string" && desc.trim().length > 0) {
              textParts.push(desc);
            }
          }
        }
      }
      
      // Add message (optional, for additional context)
      if (msg && typeof msg === "string" && msg.trim().length > 0) {
        textParts.push(msg);
      }
      
      // Lowercase the combined text
      const textBlob = textParts.join(" ").toLowerCase();
      
      // Check for drywall-specific keywords first
      if (textBlob.includes("drywall") || textBlob.includes("sheetrock") || textBlob.includes("gypsum")) {
        if ("drywall" in categoryIdToLabel) {
          return "drywall" as CategoryId;
        }
      }
      
      // Try normalizeCategoryInput on the text blob or categoryLabel
      const candidateString = draft.categoryLabel && typeof draft.categoryLabel === "string"
        ? draft.categoryLabel
        : textBlob;
      
      const normalized = normalizeCategoryInput(candidateString);
      if (normalized.categoryId && normalized.categoryId in categoryIdToLabel) {
        return normalized.categoryId;
      }
      
      return null;
    }
    
    // CRITICAL: Deterministic category inference after extraction+merge (runs for both LLM and offline paths)
    // This ensures categoryId is inferred even when LLM extraction succeeds but doesn't set categoryId
    if (!updatedDraft.categoryId) {
      const inferred = inferCategoryIdFromDraft(updatedDraft, message);
      if (inferred) {
        updatedDraft.categoryId = inferred;
        updatedDraft.categoryLabel = categoryIdToLabel[inferred];
        draftPatch.categoryId = inferred;
        draftPatch.categoryLabel = categoryIdToLabel[inferred];
      }
    }

    // Helper: Check if draft has procurement signals
    function hasProcurementSignals(draft: any): boolean {
      return !!(
        draft.categoryId ||
        (Array.isArray(draft.lineItems) && draft.lineItems.length > 0) ||
        draft.needBy ||
        draft.neededBy || // Check alias too (before canonicalization)
        draft.fulfillmentType ||
        draft.visibility
      );
    }

    // Step 8d: Post-extraction execution mode upgrade based on procurement signals
    // If extraction reveals procurement fields, upgrade to PROCUREMENT mode
    // This handles cases like "I need 25 sheets... pickup tomorrow" where extraction reveals procurement
    // Only upgrade if not already in PROCUREMENT and intent wasn't explicitly ASK_INFO/CONFIRM/DECLINE
    if (
      executionMode !== "PROCUREMENT" &&
      intent !== "ASK_INFO" &&
      intent !== "CONFIRM" &&
      intent !== "DECLINE" &&
      hasProcurementSignals(updatedDraft)
    ) {
      // Upgrade to PROCUREMENT mode based on extracted signals
      executionMode = "PROCUREMENT";
      if (!statePatch) statePatch = {};
      statePatch.mode = "PROCUREMENT";
      threadState = { ...(threadState ?? getDefaultThreadState()), mode: "PROCUREMENT" };
      
      if (process.env.NODE_ENV === "development") {
        console.log(`[AGENT_TURN] ${requestId} EXECUTION_MODE_UPGRADED_TO_PROCUREMENT`, {
          reason: "procurement_signals_detected",
          originalIntent: intent,
          signals: {
            categoryId: !!updatedDraft.categoryId,
            lineItems: Array.isArray(updatedDraft.lineItems) ? updatedDraft.lineItems.length : 0,
            needBy: !!updatedDraft.needBy,
            fulfillmentType: !!updatedDraft.fulfillmentType,
            visibility: !!updatedDraft.visibility,
          },
        });
      }
    }

    // INTERRUPTIBLE PROCUREMENT: If user asks a question mid-procurement,
    // answer conversationally WITHOUT forcing slot progression
    // This check happens AFTER extraction but BEFORE computing RFQ status
    // CRITICAL: This block does NOT persist or return early - it only stores the answer
    // and allows execution to continue into computeProcurementStatus below
    if (executionMode === "PROCUREMENT") {
      const looksLikeQuestion =
        message.includes("?") ||
        message.toLowerCase().startsWith("what") ||
        message.toLowerCase().startsWith("how") ||
        message.toLowerCase().startsWith("do") ||
        message.toLowerCase().startsWith("can");
        if (looksLikeQuestion && !isPricingConfirmation(message)) {
          // Answer the question, but DO NOT stop the procurement flow.
          // Store the answer so we can prepend it to the next required slot question later.
          // CRITICAL: Do NOT call persistTurn() or return NextResponse.json() here.
          // Procurement mode must remain PROCUREMENT. Advice is only an inline interruption.
          let responseText = "";

          if (isAIConfigured) {
            try {
              const openai = new OpenAI({ apiKey: aiConfigResult.config.apiKey });
              responseText = await callAdviceMode(openai, message, aiConfigResult.config.model);
            } catch {
              responseText = "Here\x27s what I know about that.";
            }
          } else {
            responseText = "Here\x27s what I know about that.";
          }

          // Store answer for later use - execution continues to computeProcurementStatus below
          // CRITICAL: Sanitize to remove follow-up questions and cap length for procurement flow
          (updatedDraft as any).__infoAnswer = sanitizeInlineInfoAnswer(responseText);
          // Continue to procurementStatus computation below (no early return)
        }
    }

    // Step 8d: Route behavior based on intent (intent already detected in Step 8a)
    // CRITICAL: Log intent for debugging
    console.log(`[AGENT_INTENT] ${requestId}`, {
      threadId,
      intent,
      reason: intent === "PROCURE" ? "procurement_intent_detected" : intent === "ASK_INFO" ? "info_question" : "default",
      message: message.substring(0, 100),
      executionMode,
    });
    
    // ASK_INFO: Handle informational questions
    // If in advice mode: answer and return
    // If in procurement mode: answer then continue procurement
    if (intent === "ASK_INFO") {
      // Answer the question (reuse existing advice mechanism)
      let adviceAssistantText = "";
      
      if (isAIConfigured) {
        try {
          const openai = new OpenAI({ apiKey: aiConfigResult.config.apiKey });
          adviceAssistantText = await callAdviceMode(openai, message, aiConfigResult.config.model);
        } catch {
          adviceAssistantText = "I'd be happy to help with that. Could you provide a bit more detail?";
        }
      } else {
        // Offline mode: provide basic answers for common questions
        const lower = message.toLowerCase();
        if (lower.includes("thick") && lower.includes("hardie")) {
          adviceAssistantText = "Hardie lap siding typically comes in 8.25\" exposure. The actual board thickness is about 5/16\" (0.3125\").";
        } else if (lower.includes("how many") && (lower.includes("square") || lower.includes("sq ft"))) {
          adviceAssistantText = "In siding, 'square' means 100 sq ft of coverage. For 100 squares (10,000 sq ft), you'd need approximately 1,429 boards (assuming 12' boards at 7\" exposure, with 10% waste).";
        } else {
          adviceAssistantText = "I'd be happy to help with that. Could you provide a bit more detail?";
        }
      }
      
      // ASK_INFO in ADVICE mode: return early (pure Q&A)
      if (executionMode === "ADVICE") {
        const infoDraftPatch: Record<string, unknown> = {
          __lastUserMessageId: userMessageId,
        };
        
        if (threadId) {
          await persistTurn(
            threadId,
            userMessageId,
            message,
            adviceAssistantText,
            clientTurnId,
            infoDraftPatch,
            user.id,
            requestId,
            statePatch // Pass statePatch to persist any mode changes
          );
        }
        
        return NextResponse.json({
          ok: true,
          mode: "advice",
          assistantText: adviceAssistantText,
          draftPatch: infoDraftPatch,
        });
      }
      
      // ASK_INFO in PROCUREMENT mode: answer then continue procurement (DO NOT downgrade executionMode)
      // Store the answer - will be handled after procurementStatus is computed
      // CRITICAL: Sanitize to remove follow-up questions and cap length for procurement flow
      (updatedDraft as any).__infoAnswer = sanitizeInlineInfoAnswer(adviceAssistantText);
      // Continue to procurement flow (don't return early, don't change executionMode)
      // executionMode remains "PROCUREMENT" - ASK_INFO never downgrades the mode
    }
    
    // DECLINE: User declined pricing confirmation
    if (intent === "DECLINE") {
      // Reset dispatch status to IDLE
      if (threadState) {
        statePatch = {
          ...(statePatch || {}),
          dispatch: {
            ...(threadState.dispatch || {}),
            status: "IDLE" as const,
            error: undefined,
          },
        };
      }
      
      const declineResponse = "No problem — tell me when you want to send it.";
      
      if (threadId) {
        await persistTurn(
          threadId,
          userMessageId,
          message,
          declineResponse,
          clientTurnId,
          draftPatch,
          user.id,
          requestId,
          statePatch // Pass statePatch to persist mode changes
        );
      }
      
      return NextResponse.json({
        ok: true,
        mode: executionMode === "PROCUREMENT" ? "procurement" : "advice",
        assistantText: declineResponse,
        draftPatch,
      });
    }
    
    // REMOVED: Duplicate ADVICE handling - Step 7 already handles ADVICE mode and returns early
    // If we reach here, executionMode is PROCUREMENT (advice already returned)

    // Step 8e: Compute procurement status (after extraction and draft patch application)
    // CRITICAL: Compute from the UPDATED canonical draft (after applyNormalizedPatch)
    let procurementStatus;
    if (executionMode === "PROCUREMENT") {
      procurementStatus = computeProcurementStatus({
        draft: updatedDraft, // Use the final canonical draft after patch application
        threadState,
      });
      
      // Visibility parsing should work even if we asked it via the "draft complete" confirmation prompt.
      // If visibility is not set yet, accept A/B + broadcast/direct phrases and persist immediately.
      if (!updatedDraft.visibility || (updatedDraft.visibility !== "broadcast" && updatedDraft.visibility !== "direct")) {
        const v = parseVisibilityAnswer(message);
        if (v) {
          draftPatch.visibility = v;
          (updatedDraft as any).visibility = v;
        }
      }
      
      // CRITICAL: Log procurement status for debugging (dev-only)
      if (process.env.NODE_ENV === "development") {
        console.log(`[AGENT_PROC_STATUS] ${requestId}`, {
          threadId,
          draftVisibility: updatedDraft.visibility,
          draftCategoryId: updatedDraft.categoryId,
          missing: procurementStatus.missingRequired,
          nextQuestionId: procurementStatus.nextQuestionId,
          isReadyToConfirm: procurementStatus.isReadyToConfirm,
          userMessageContainsPreferred,
        });
      }
      
      // CRITICAL: Log draft state after merge
      console.log(`[AGENT_DRAFT_AFTER_MERGE] ${requestId}`, {
        hasLineItems: Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0,
        fulfillmentType: updatedDraft.fulfillmentType,
        visibility: updatedDraft.visibility,
        targetCount: updatedDraft.visibility === "direct" ? (Array.isArray((updatedDraft as any).targetSupplierIds) ? (updatedDraft as any).targetSupplierIds.length : 0) : null,
      });
    } else {
      // Fallback to base RFQ status for ADVICE mode
      procurementStatus = computeRfqStatus({
        draft: updatedDraft,
        threadState,
      });
    }
    
    // Step 8g: Wire follow-up handling (AFTER extraction and status computation)
    // Only run if mode is PROCUREMENT and nextQuestionId matches lastQuestionId
    if (executionMode === "PROCUREMENT") {
      const lastQuestionId = threadState?.progress?.lastQuestionId;
      const nextQuestionId = procurementStatus.nextQuestionId;
      
      // REMOVED: Legacy follow-up handling - extraction handles this naturally
    }
    
    // DIRECT-ORDER CONFIRMATION: After extraction, confirm what was captured
    if (executionMode === "PROCUREMENT" && updatedDraft.lineItems && updatedDraft.categoryId) {
      const lineItems = Array.isArray(updatedDraft.lineItems) ? updatedDraft.lineItems : [];
      if (lineItems.length > 0) {
        const firstItem = lineItems[0] as { quantity?: number; unit?: string; description?: string };
        const qty = firstItem.quantity || 0;
        const unit = firstItem.unit || "";
        const desc = firstItem.description || "";
        const fulfillmentType = updatedDraft.fulfillmentType;
        const neededBy = updatedDraft.needBy;
        
        // Build confirmation message
        let confirmationMsg = `Got it — ${qty} ${unit.toLowerCase()} of ${desc}`;
        if (typeof fulfillmentType === "string") {
          confirmationMsg += `, ${fulfillmentType.toLowerCase()}`;
        }
        if (neededBy) {
          confirmationMsg += ` ${neededBy}`;
        }
        confirmationMsg += ".";
        
        // Store confirmation message to use later if no follow-up was handled
        // We'll use this in the decision tree below
        (updatedDraft as any).__confirmationMessage = confirmationMsg;
      }
    }
    
    // Helper function to ask a question (simple, no slot engine)
    async function askQuestion(nextQuestionId: string | null): Promise<string> {
      const prisma = getPrisma();
      return await getQuestionForFieldEnhanced(prisma, nextQuestionId);
    }
    
    // Store status for dispatch logic below (use procurementStatus for consistency)
    const status = procurementStatus;
    
    // Clean up any legacy slot tracking from draftPatch
    delete (draftPatch as any).__resolvedSlots;
    delete (draftPatch as any).__lastAskedSlot;
    delete (draftPatch as any).__lastQuestionAsked;
    delete (draftPatch as any).__lastActionTimestamp;

    // Step 8e: Handle dispatch if ready and user confirmed
    // Check pricing confirmation state - CRITICAL: Use ThreadState.dispatch as authoritative source
    const dispatchStatusFromState = threadState?.dispatch?.status;
    const pricingConfirmed = dispatchStatusFromState === "CONFIRMED" || dispatchStatusFromState === "DISPATCHING" || dispatchStatusFromState === "DISPATCHED";
    const pricingDispatched = dispatchStatusFromState === "DISPATCHED";
    const existingRequestId = threadState?.dispatch?.requestId;
    let didDispatchThisTurn = false;
    
    // Check if user is confirming pricing (use procurementStatus.isReadyToConfirm)
    const isPricingConfirmMessage = procurementStatus.isReadyToConfirm &&
                                     isPricingConfirmation(message);
    
    // Check if user is declining pricing
    const isPricingDeclineMessage =
      procurementStatus.isReadyToConfirm &&
                                     !isPricingConfirmation(message) &&
      (
        message.toLowerCase().includes("no") ||
                                      message.toLowerCase().includes("not yet") ||
                                      message.toLowerCase().includes("wait") ||
        message.toLowerCase().includes("later")
      );
    
    // Initialize assistantText - this is the ONLY place that sets it
    let assistantText = "";
    
    /**
     * Convert canonical draft to RFQ creation payload
     * Uses canonical draft directly (no normalization needed)
     */
    function draftToRfqPayload(draft: Record<string, unknown>, buyerId: string): {
      title: string;
      notes: string;
      categoryId: CategoryId;
      category: string;
      lineItems: Array<{ description: string; unit: string; quantity: number }>;
      terms: {
        fulfillmentType: "PICKUP" | "DELIVERY";
        requestedDate: string;
        location?: string;
      };
      visibility: "broadcast" | "direct";
      targetSupplierIds?: string[];
      fulfillmentType: "PICKUP" | "DELIVERY";
      deliveryAddress: string | null;
      needBy: string | null;
    } | null {
      // Use canonical draft directly (no normalization needed - draft is already canonical)
      if (!draft.lineItems || !Array.isArray(draft.lineItems) || draft.lineItems.length === 0) {
        return null;
      }

      const categoryId = draft.categoryId as CategoryId | undefined;
      if (!categoryId || !(categoryId in categoryIdToLabel)) {
        return null;
      }

      // Normalize fulfillmentType to uppercase (accept lowercase input)
      const rawFulfillmentType = (draft.fulfillmentType || "PICKUP") as string;
      let fulfillmentType = (rawFulfillmentType.toUpperCase() === "DELIVERY" ? "DELIVERY" : "PICKUP") as "PICKUP" | "DELIVERY";
      const categoryLabel = categoryIdToLabel[categoryId as keyof typeof categoryIdToLabel];

      // Normalize deliveryAddress (trim whitespace, treat "" as null)
      let deliveryAddress: string | null = null;
      if (draft.deliveryAddress) {
        const addr = String(draft.deliveryAddress).trim();
        deliveryAddress = addr || null;
      }

      // CRITICAL: Validate fulfillmentType/deliveryAddress invariant
      // If DELIVERY without address, return null to block RFQ creation
      if (fulfillmentType === "DELIVERY" && !deliveryAddress) {
        // Log validation error
        console.error("[RFQ_VALIDATION_ERROR]", {
          code: "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED",
          error: "deliveryAddress is required when fulfillmentType is DELIVERY",
          draftFulfillmentType: draft.fulfillmentType,
          draftDeliveryAddress: draft.deliveryAddress,
        });
        // Return null to block RFQ creation - caller must handle error
        return null;
      }

      const lineItems = (draft.lineItems as Array<{ description?: string; unit?: string; quantity?: number }>)
        .map((item) => ({
          description: item.description || "",
          unit: item.unit || "EA",
          quantity: item.quantity || 1,
        }))
        .filter((item) => item.description && item.quantity > 0);

      if (lineItems.length === 0) {
        return null;
      }

      // Extract needBy - accept "ASAP" or YYYY-MM-DD
      const needByRaw = draft.needBy as string | undefined;
      let needBy: string | null = null;
      if (needByRaw) {
        const needByStr = String(needByRaw).trim();
        const needByUpper = needByStr.toUpperCase();
        if (needByUpper === "ASAP") {
          needBy = "ASAP";
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(needByStr)) {
          // Valid YYYY-MM-DD format (preserve original case)
          needBy = needByStr;
        }
      }

      // requestedDate for terms: use needBy if it's a date, otherwise use today
      const requestedDate = needBy && needBy !== "ASAP" ? needBy : new Date().toISOString().split("T")[0];

      // CRITICAL: terms.fulfillmentType must match RFQ.fulfillmentType (canonical source)
      const terms: {
        fulfillmentType: "PICKUP" | "DELIVERY";
        requestedDate: string;
        location?: string;
      } = {
        fulfillmentType, // Keep in sync with RFQ.fulfillmentType
        requestedDate,
      };

      // Only set location if we have a delivery address
      if (deliveryAddress) {
        terms.location = deliveryAddress;
      }

      // Determine visibility from draft or default to broadcast
      // Visibility is independent - it's either "broadcast" (all eligible) or "direct" (preferred suppliers only)
      const visibility = (draft.visibility as "broadcast" | "direct" | undefined) || "broadcast";

      // For direct RFQs, targetSupplierIds will be resolved outside this function
      // (preferred suppliers are resolved from database asynchronously)
      return {
        title: (draft.jobNameOrPo as string) || "Material Request",
        notes: (draft.notes as string) || "",
        categoryId: categoryId as CategoryId,
        category: categoryLabel,
        lineItems,
        terms,
        visibility,
        fulfillmentType,
        deliveryAddress,
        needBy,
        // targetSupplierIds will be populated below if visibility is "direct"
      };
    }

    // Handle pricing confirmation or decline
    if (isPricingDeclineMessage) {
      // User declined - reset confirmation state
      if (threadState) {
        statePatch = {
          dispatch: {
            ...(threadState.dispatch || {}),
            status: "IDLE" as const, // Reset to IDLE on decline
            error: undefined,
          },
        };
      }
      // Response will be built below
    } else if (isPricingConfirmMessage) {
      // User confirmed pricing - mark as confirmed and dispatch
      // CRITICAL: Confirmation → dispatch must be idempotent and guaranteed
      console.log(`[PRICING_CONFIRMED] ${requestId}`, {
        threadId,
        userId: user.id,
        requestId: existingRequestId || "new",
        isReadyToConfirm: procurementStatus.isReadyToConfirm,
      });
      
      // CRITICAL: Must pass readiness gate before confirming/dispatching
      if (!procurementStatus.isReadyToConfirm) {
        // Gate not passed - ask for missing field instead
        if (procurementStatus.nextQuestionId) {
          // If the agent is asking for more line items but the user is clearly "done",
          // advance to the next missing field instead of looping.
          if (
            procurementStatus.nextQuestionId === "lineItems" &&
            isLineItemsDoneMessage(message) &&
            updatedDraft?.lineItems &&
            Array.isArray(updatedDraft.lineItems) &&
            updatedDraft.lineItems.length > 0
          ) {
            const nextId = nextQuestionFromDraft(updatedDraft);
            if (nextId && nextId !== "lineItems") {
              // Use enhanced helper for all fields (includes DB-backed visibility)
              const prisma = getPrisma();
              assistantText = await getQuestionForFieldEnhanced(prisma, nextId);
            } else {
              assistantText = "Everything looks good. Want me to send this out for pricing?";
            }
          } else {
            // Use enhanced helper for all fields (includes DB-backed visibility)
            const prisma = getPrisma();
            assistantText = await getQuestionForFieldEnhanced(prisma, procurementStatus.nextQuestionId);
          }
        }
        // Don't confirm or dispatch - just ask for missing slot
      } else {
        // Check idempotency: if already dispatched, skip
        if (pricingDispatched && existingRequestId) {
          console.log(`[RFQ_DISPATCH_SKIPPED_ALREADY_DISPATCHED] ${requestId}`, {
            threadId,
            userId: user.id,
            requestId: existingRequestId,
          });
          // Mark as confirmed if not already - update ThreadState
          if (!pricingConfirmed && threadState) {
            const now = new Date().toISOString();
            statePatch = {
              ...(statePatch || {}),
              dispatch: {
                ...(threadState.dispatch || {}),
                status: "CONFIRMED" as const,
                confirmedAt: now,
              },
            };
          }
        } else {
          // Proceed with dispatch (guaranteed - gate passed)
          // CRITICAL: Confirmation → dispatch is guaranteed here
          // If dispatch fails, we mark as confirmed but not dispatched (for retry)
          // Use canonical draft directly (no normalization needed - draft is already canonical)
          let rfqPayload = draftToRfqPayload(updatedDraft, user.id);
        
        if (!rfqPayload) {
          // Payload creation failed - check if it's due to deliveryAddress validation
          const fulfillmentType = (updatedDraft.fulfillmentType || "").toString().toUpperCase();
          const deliveryAddress = updatedDraft.deliveryAddress 
            ? String(updatedDraft.deliveryAddress).trim() || null
            : null;
          
          const isDeliveryAddressError = fulfillmentType === "DELIVERY" && !deliveryAddress;
          
          const errorCode = isDeliveryAddressError 
            ? "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED"
            : "RFQ_PAYLOAD_CREATION_FAILED";
          const errorMessage = isDeliveryAddressError
            ? "deliveryAddress is required when fulfillmentType is DELIVERY"
            : "Payload creation failed";
          
          console.error(`[RFQ_DISPATCH_BLOCKED] ${requestId}`, {
            threadId,
            userId: user.id,
            code: errorCode,
            error: errorMessage,
            draft: {
              jobNameOrPo: updatedDraft.jobNameOrPo,
              hasLineItems: !!updatedDraft.lineItems && Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0,
              neededBy: updatedDraft.needBy,
              fulfillmentType: updatedDraft.fulfillmentType,
              deliveryAddress: updatedDraft.deliveryAddress,
              categoryId: updatedDraft.categoryId,
            },
          });
          
          // Mark as confirmed but not dispatched (for retry) - update ThreadState
          const now = new Date().toISOString();
          if (threadState) {
            statePatch = {
              ...(statePatch || {}),
              dispatch: {
                ...(threadState.dispatch || {}),
                status: "CONFIRMED" as const,
                confirmedAt: now,
                error: errorMessage,
              },
            };
          }
          
          // Set assistantText with clear error message
          assistantText = isDeliveryAddressError
            ? "I need a delivery address to send this out. What's the delivery address or ZIP code for the job site?"
            : "I encountered an error while creating your RFQ. Please try again or contact support if the issue persists.";
          
          // Mark that RFQ creation was blocked
          (updatedDraft as any).__rfqCreationFailed = true;
          (updatedDraft as any).__rfqCreationErrorCode = errorCode;
        } else if (rfqPayload) {
        try {
          const prisma = getPrisma();
          
          // CRITICAL: If visibility is "direct", resolve preferred suppliers from database
          // targetSupplierIds must contain SELLER user IDs (not supplier IDs or other identifiers)
          if (rfqPayload.visibility === "direct") {
            const categoryId = rfqPayload.categoryId;
            
            // Query preferred supplier rules for this buyer and category
            const preferredRules = await prisma.preferredSupplierRule.findMany({
              where: {
                buyerId: user.id,
                enabled: true,
                OR: [
                  { categoryId: categoryId },
                  { category: categoryId },
                ],
              },
              select: {
                sellerIds: true,
              },
            });
            
            // Collect all seller IDs from enabled rules
            const targetSupplierIdsSet = new Set<string>();
            for (const rule of preferredRules) {
              if (rule.sellerIds) {
                try {
                  const sellerIds = JSON.parse(rule.sellerIds);
                  if (Array.isArray(sellerIds)) {
                    for (const sellerId of sellerIds) {
                      if (typeof sellerId === "string" && sellerId.trim()) {
                        targetSupplierIdsSet.add(sellerId.trim());
                      }
                    }
                  }
                } catch {
                  // Invalid JSON, skip this rule
                }
              }
            }
            
            // Validate that all seller IDs exist as SELLER users
            const targetSupplierIdsArray = Array.from(targetSupplierIdsSet);
            if (targetSupplierIdsArray.length > 0) {
              const validSellers = await prisma.user.findMany({
                where: {
                  id: { in: targetSupplierIdsArray },
                  role: "SELLER",
                },
                select: { id: true },
              });
              
              // Only include valid SELLER user IDs
              rfqPayload.targetSupplierIds = validSellers.map(s => s.id);
              
              // Log direct RFQ targets
              console.log("[RFQ_DIRECT_TARGETS]", {
                rfqId: "pending", // Will be set after creation
                buyerId: user.id,
                categoryId,
                targetSupplierIds: rfqPayload.targetSupplierIds,
                targetCount: rfqPayload.targetSupplierIds.length,
                preferredRulesCount: preferredRules.length,
              });
            } else {
              // No preferred suppliers found - this should not happen if user selected "direct"
              // But we'll log it and proceed (validation will catch it in the API)
              console.warn("[RFQ_DIRECT_NO_TARGETS]", {
                buyerId: user.id,
                categoryId,
                message: "Direct RFQ requested but no preferred suppliers found",
              });
            }
          }
          
          const existingRFQs = await prisma.rFQ.findMany({
            where: { buyerId: user.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          });

          const currentYear = new Date().getFullYear();
          const yearPrefix = currentYear.toString().slice(-2);
          let maxNumber = 0;
          for (const rfq of existingRFQs) {
            if (rfq.rfqNumber?.startsWith(`RFQ-${yearPrefix}-`)) {
              const numberPart = rfq.rfqNumber.split("-")[2];
              const num = parseInt(numberPart, 10);
              if (!isNaN(num) && num > maxNumber) {
                maxNumber = num;
              }
            }
          }
          const rfqNumber = `RFQ-${yearPrefix}-${(maxNumber + 1).toString().padStart(4, "0")}`;

          // CRITICAL: Final validation - ensure fulfillmentType/deliveryAddress invariant
          // This is a safety check even though draftToRfqPayload should have validated
          // If this check fails, it means draftToRfqPayload validation was bypassed - block creation
          if (rfqPayload.fulfillmentType === "DELIVERY" && !rfqPayload.deliveryAddress) {
            console.error("[RFQ_CREATE_VALIDATION_ERROR]", {
              code: "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED",
              error: "deliveryAddress is required when fulfillmentType is DELIVERY",
              fulfillmentType: rfqPayload.fulfillmentType,
              deliveryAddress: rfqPayload.deliveryAddress,
            });
            // Block RFQ creation - return 400 error
            return jsonError("RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED", "deliveryAddress is required when fulfillmentType is DELIVERY", 400);
          }

          // CRITICAL: Persist RFQ to database BEFORE marking as dispatched
          // This ensures RFQ appears in GET /api/buyer/rfqs and seller feeds
          // Extract jobNameOrPo from updatedDraft (used as title, but also persist separately)
          const jobNameOrPo =
            (typeof (updatedDraft as any)?.jobNameOrPo === "string" && (updatedDraft as any).jobNameOrPo.trim().length > 0
              ? (updatedDraft as any).jobNameOrPo.trim()
              : rfqPayload.title);
          
          let created;
          try {
            created = await prisma.rFQ.create({
              data: {
                id: crypto.randomUUID(),
                rfqNumber,
                status: "OPEN",
                title: rfqPayload.title,
                notes: rfqPayload.notes,
                category: rfqPayload.category,
                categoryId: rfqPayload.categoryId,
                jobNameOrPo: jobNameOrPo, // CRITICAL: Persist jobNameOrPo separately
                buyer: { connect: { id: user.id } },
                lineItems: JSON.stringify(rfqPayload.lineItems),
                terms: JSON.stringify(rfqPayload.terms),
                visibility: rfqPayload.visibility || "broadcast",
                targetSupplierIds: rfqPayload.targetSupplierIds && rfqPayload.targetSupplierIds.length > 0
                  ? JSON.stringify(rfqPayload.targetSupplierIds)
                  : null,
                fulfillmentType: rfqPayload.fulfillmentType,
                deliveryAddress: rfqPayload.deliveryAddress,
                needBy: rfqPayload.needBy,
              },
            });
          } catch (error) {
            // Check for CHECK constraint violation: rfq_delivery_requires_address
            // Detect: Prisma P2004 (check constraint) with constraint name, Postgres 23514, or message contains constraint name
            const isConstraintViolation = 
              (error instanceof Prisma.PrismaClientKnownRequestError && 
               error.code === "P2004" &&
               (error.meta?.constraint === "rfq_delivery_requires_address" || 
                String(error.meta?.target || "").includes("rfq_delivery_requires_address"))) ||
              ((error as any).code === "23514") ||
              (error instanceof Error && error.message.includes("rfq_delivery_requires_address"));
            
            if (isConstraintViolation) {
              console.error("[RFQ_CREATE_CONSTRAINT_VIOLATION]", {
                constraint: "rfq_delivery_requires_address",
                fulfillmentType: rfqPayload.fulfillmentType,
                deliveryAddress: rfqPayload.deliveryAddress ? "present" : "missing",
                userId: user.id,
                threadId,
                requestId,
              });
              // Return 400 error for constraint violation
              return jsonError("RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED", "deliveryAddress is required when fulfillmentType is DELIVERY", 400);
            }
            
            // Re-throw other errors for existing error handling
            throw error;
          }
          
          // CRITICAL: Verify RFQ was created successfully
          if (!created || !created.id) {
            throw new Error("RFQ creation returned null or missing ID");
          }
          
          // CRITICAL: Log DB creation success immediately after create (matches buyer endpoint pattern)
          console.log("[RFQ_CREATE_DB_OK]", {
            id: created.id,
            rfqNumber: created.rfqNumber,
          });
          
          // ============================================================
          // OPTION B: Email everyone (account + non-account suppliers)
          // - Sellers with accounts are handled via seller feed/notifications.
          // - Reference suppliers (Supplier table) get an invite + email.
          // ============================================================

          // Only for broadcast RFQs (all eligible suppliers)
          if ((created.visibility || "broadcast") === "broadcast") {
            try {
              // Resolve category label (stored in RFQ.category or categoryId depending on schema)
              const category = (created.category || rfqPayload.category || "ROOFING").toString().toUpperCase();

              // For now we only support Huntsville, AL reference suppliers (matches your earlier list)
              const city = "Huntsville";
              const state = "AL";

              const refSuppliers = await prisma.supplier.findMany({
                where: { category, city, state },
                select: { id: true, name: true, email: true },
                orderBy: { name: "asc" },
              });

              const baseUrl = getBaseUrl();
              const inviteTtlDays = 14;
              const expiresAt = new Date(Date.now() + inviteTtlDays * 24 * 60 * 60 * 1000);

              for (const ref of refSuppliers) {
                if (!ref.email) continue;

                // Idempotent: reuse an existing unused, unexpired invite if it exists
                const existingInvite = await prisma.supplierRfqInvite.findFirst({
                  where: {
                    rfqId: created.id,
                    supplierId: ref.id,
                    usedAt: null,
                    expiresAt: { gt: new Date() },
                  },
                  select: { tokenHash: true, expiresAt: true },
                });

                let tokenPlain: string | null = null;

                if (!existingInvite) {
                  // Create new token + hash
                  tokenPlain = crypto.randomBytes(24).toString("hex");
                  const tokenHash = crypto.createHash("sha256").update(tokenPlain).digest("hex");

                  await prisma.supplierRfqInvite.create({
                    data: {
                      rfqId: created.id,
                      supplierId: ref.id,
                      tokenHash,
                      expiresAt,
                    },
                  });

                  console.log("[SUPPLIER_INVITE_CREATED]", {
                    rfqId: created.id,
                    supplierId: ref.id,
                    supplierEmail: ref.email,
                    expiresAt: expiresAt.toISOString(),
                  });
                } else {
                  console.log("[SUPPLIER_INVITE_REUSED]", {
                    rfqId: created.id,
                    supplierId: ref.id,
                    supplierEmail: ref.email,
                    expiresAt: existingInvite.expiresAt.toISOString(),
                  });
                }

                // Call the existing RFQ email endpoint.
                // In dev/test this is SAFE: /api/notifications/rfq-created will skip sending.
                const idempotencyKey = `rfq:${created.id}:supplier:${ref.id}`;

                // If we reused an invite, we can't recover the plain token (by design),
                // so we send without token (fallback CTA to signup). If we created fresh,
                // we include the plain token in the payload.
                await fetch(`${baseUrl}/api/notifications/rfq-created`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                  },
                  body: JSON.stringify({
                    rfq: {
                      id: created.id,
                      buyerName: user.fullName || user.companyName || "Buyer",
                      category: category,
                      title: created.title || rfqPayload.title || "New RFQ",
                      description: created.notes || undefined,
                      createdAt: created.createdAt.toISOString(),
                      dueAt: (created as any).dueAt || undefined,
                      location: (created as any).location || undefined,
                      urlPath: `/seller/feed?category=${encodeURIComponent(category)}&from=email`,
                    },
                    supplier: {
                      id: ref.id,
                      email: ref.email,
                      name: ref.name,
                    },
                    invite: tokenPlain
                      ? { token: tokenPlain, expiresAt: expiresAt.toISOString() }
                      : undefined,
                    preview: {
                      lineItemCount: Array.isArray(rfqPayload.lineItems) ? rfqPayload.lineItems.length : undefined,
                    },
                  }),
                }).catch((e) => {
                  console.error("[SUPPLIER_EMAIL_INVOKE_FAILED]", {
                    rfqId: created.id,
                    supplierId: ref.id,
                    supplierEmail: ref.email,
                    error: e instanceof Error ? e.message : String(e),
                  });
                });
              }
            } catch (e) {
              console.error("[SUPPLIER_INVITE_FLOW_FAILED]", {
                rfqId: created.id,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
          
          // Log direct RFQ targets with actual RFQ ID
          if (rfqPayload.visibility === "direct" && rfqPayload.targetSupplierIds) {
            console.log("[RFQ_DIRECT_TARGETS]", {
              rfqId: created.id,
              targetSupplierIds: rfqPayload.targetSupplierIds,
              targetCount: rfqPayload.targetSupplierIds.length,
            });
          }

          // CRITICAL: Agent-created RFQs use canonical routing model (visibility + targetSupplierIds)
          // DO NOT call dispatchRequestToSuppliers - routing is handled by seller feed/direct invites system
          // The /api/buyer/rfqs route handles notifications/emails in background for OPEN RFQs
          
          // Calculate target count for logging (deterministic summary)
          const primaryCount = rfqPayload.visibility === "direct" && rfqPayload.targetSupplierIds
            ? rfqPayload.targetSupplierIds.length
            : null;
          const fallbackCount = 0;

          // Set persistent markers - mark as DISPATCHED after RFQ creation
          // Routing will be handled by seller feed/direct invites reading RFQ.visibility and RFQ.targetSupplierIds
          const now = new Date().toISOString();
          if (threadState) {
            statePatch = {
              ...(statePatch || {}),
              dispatch: {
                ...(threadState.dispatch || {}),
                status: "DISPATCHED" as const,
                confirmedAt: threadState.dispatch?.confirmedAt || now,
                dispatchedAt: now,
                requestId: created.id,
                error: undefined,
              },
            };
          }
          // Mark that dispatch succeeded on this turn
          didDispatchThisTurn = true;
          // Legacy slot tracking removed

          // Always preserve lineItems if they exist
          if (updatedDraft.lineItems && Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0) {
            draftPatch.lineItems = updatedDraft.lineItems;
          }

          // CRITICAL: Log RFQ creation (matches buyer endpoint pattern)
          console.log("[RFQ_CREATE_OK]", {
            rfqId: created.id,
            createdByUserId: user.id,
            categoryId: created.categoryId || created.category,
            visibility: created.visibility || "broadcast",
            rfqNumber: created.rfqNumber,
            status: created.status,
          });

          // Log agent RFQ creation with routing summary
          console.log("[RFQ_AGENT_CREATED]", {
            rfqId: created.id,
            rfqNumber: created.rfqNumber,
            visibility: rfqPayload.visibility,
            targetCount: primaryCount,
            buyerId: user.id,
            categoryId: rfqPayload.categoryId,
          });

          console.log(`[RFQ_DISPATCHED] ${requestId}`, {
            threadId,
            requestId: created.id,
            userId: user.id,
            categoryId: updatedDraft.categoryId,
            lineItemsCount: updatedDraft.lineItems ? (updatedDraft.lineItems as Array<unknown>).length : 0,
            primaryCount,
            fallbackCount,
            visibility: rfqPayload.visibility,
          });
        } catch (error) {
          // CRITICAL: RFQ creation failed - do NOT mark as dispatched
          // Return error to user and keep status as CONFIRMED (not DISPATCHED) for retry
          const now = new Date().toISOString();
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Check if this is a deliveryAddress validation error
          const isDeliveryAddressError = errorMessage.includes("RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED") ||
                                        errorMessage.includes("deliveryAddress is required");
          const errorCode = isDeliveryAddressError 
            ? "RFQ_VALIDATION_DELIVERY_ADDRESS_REQUIRED"
            : "RFQ_CREATION_FAILED";
          
          // Set error in statePatch
          if (threadState) {
            statePatch = {
              ...(statePatch || {}),
              dispatch: {
                ...(threadState.dispatch || {}),
                status: "CONFIRMED" as const, // Keep as CONFIRMED, not DISPATCHED
                confirmedAt: threadState.dispatch?.confirmedAt || now,
                error: errorMessage,
              },
            };
          }

          // CRITICAL: Set error message in assistantText so user knows RFQ was NOT sent
          // Use clear, actionable message for deliveryAddress errors
          if (isDeliveryAddressError) {
            assistantText = "I need a delivery address to send this out. What's the delivery address or ZIP code for the job site?";
          } else {
            assistantText = `I encountered an error while creating your RFQ: ${errorMessage}. Please try again or contact support if the issue persists.`;
          }
          
          // CRITICAL: Mark that RFQ creation failed so decision tree doesn't override error message
          (updatedDraft as any).__rfqCreationFailed = true;
          (updatedDraft as any).__rfqCreationErrorCode = errorCode;

          console.error(`[RFQ_DISPATCH_BLOCKED] ${requestId}`, {
            threadId,
            userId: user.id,
            code: errorCode,
            error: errorMessage,
            isDeliveryAddressError,
            stack: error instanceof Error ? error.stack : undefined,
          });
          
          // CRITICAL: Do NOT proceed to mark as dispatched - return error response
          // The assistantText above will be returned to the user
        }
        } // End if (rfqPayload)
        } // End else (proceed with dispatch)
      } // End else (gate passed)
    } // End if (isPricingConfirmMessage)

    // Update threadState with statePatch if any changes were made (needed for finalDispatchStatus check)
    if (statePatch && threadState) {
      threadState = {
        ...threadState,
        ...statePatch,
        dispatch: {
          ...threadState.dispatch,
          ...statePatch.dispatch,
        },
      };
    }
    
    // Check current state after potential dispatch - use ThreadState as authoritative
    const finalDispatchStatus = threadState?.dispatch?.status;
    
    // SINGLE AUTHORITATIVE DECISION TREE: Use validateAgentDraftRFQ as canonical readiness gate
    // CRITICAL: If RFQ creation failed, preserve the error message (set in catch block above)
    const hasRfqCreationError = (updatedDraft as any).__rfqCreationFailed === true ||
                                 (threadState?.dispatch?.error && threadState?.dispatch?.status !== "DISPATCHED") ||
                                 (statePatch?.dispatch?.error && statePatch?.dispatch?.status !== "DISPATCHED");
    
    // CRITICAL: Use validateAgentDraftRFQ as the canonical source of truth for readiness
    // This ensures "Everything looks good" only appears when draft is truly complete
    const draftValidation = validateAgentDraftRFQ(updatedDraft);
    const isDraftComplete = draftValidation.ok;
    
    if (hasRfqCreationError && assistantText) {
      // RFQ creation failed - error message already set in catch block, preserve it
      // Do not override with success messages - assistantText is already set to error message
    } else if (isPricingDeclineMessage) {
      // User declined pricing confirmation
      assistantText = "No problem. Let me know when you're ready to get pricing.";
    } else if (!isDraftComplete) {
      // Draft is not complete - ask for next missing field
      // Priority: use procurementStatus.nextQuestionId for deterministic question order
      // But also check validateAgentDraftRFQ missing fields for deliveryAddress specifically
      const nextQuestionId = procurementStatus.nextQuestionId;
      const infoAnswer = (updatedDraft as any).__infoAnswer;
      const confirmationMsg = (updatedDraft as any).__confirmationMessage;
      
      // CRITICAL: For DELIVERY without deliveryAddress, ask for address specifically
      const fulfillmentType = (updatedDraft.fulfillmentType || "").toString().toUpperCase();
      const deliveryAddress = updatedDraft.deliveryAddress 
        ? String(updatedDraft.deliveryAddress).trim() || null
        : null;
      
      if (fulfillmentType === "DELIVERY" && !deliveryAddress && draftValidation.missing.includes("deliveryAddress")) {
        // DELIVERY without address - ask for address
        if (infoAnswer) {
          assistantText = `${infoAnswer}\n\nNext: What's the delivery address for the job site?`;
        } else if (confirmationMsg) {
          assistantText = `${confirmationMsg}\n\nWhat's the delivery address for the job site?`;
        } else {
          assistantText = "What's the delivery address for the job site?";
        }
      } else if (nextQuestionId) {
        // Use next question from procurementStatus
        if (nextQuestionId === "visibility") {
          const prisma = getPrisma();

          // DB-backed "eligible suppliers" (reference list) — keep routing logic unchanged
          const eligible = await prisma.supplier.findMany({
            where: {
              category: "ROOFING",
              city: "Huntsville",
              state: "AL",
            },
            orderBy: { name: "asc" },
            select: { name: true },
          });

          if (eligible.length > 0) {
            const names = eligible.map(s => s.name).join(", ");
            const visibilityQuestion =
              "Who should I send this to for pricing — your preferred suppliers only, or all eligible suppliers?\n\n" +
              `Eligible ROOFING suppliers in Huntsville: ${names}.`;
            
            // Priority: infoAnswer > confirmationMsg > visibilityQuestion
            if (infoAnswer) {
              assistantText = `${infoAnswer}\n\nNext: ${visibilityQuestion}`;
            } else if (confirmationMsg) {
              assistantText = `${confirmationMsg}\n\n${visibilityQuestion}`;
            } else {
              assistantText = visibilityQuestion;
            }
          } else {
            // Fallback to default question if no suppliers found
            const nextQuestion = await askQuestion(nextQuestionId);
            if (infoAnswer) {
              assistantText = `${infoAnswer}\n\nNext: ${nextQuestion}`;
            } else if (confirmationMsg) {
              assistantText = `${confirmationMsg}\n\n${nextQuestion}`;
            } else {
              assistantText = nextQuestion;
            }
          }
        } else {
          const nextQuestion = await askQuestion(nextQuestionId);
          
          // Priority: infoAnswer > confirmationMsg > nextQuestion
          if (infoAnswer) {
            assistantText = `${infoAnswer}\n\nNext: ${nextQuestion}`;
          } else if (confirmationMsg) {
            assistantText = `${confirmationMsg}\n\n${nextQuestion}`;
          } else {
            assistantText = nextQuestion;
          }
        }
      } else {
        // No next question but not ready - fallback
        assistantText = "What else do you need?";
      }
    } else if (!finalDispatchStatus || finalDispatchStatus === "IDLE") {
      // Draft is complete (validated by validateAgentDraftRFQ) - ask for confirmation
      // If visibility not set, ask about it first
      if (!updatedDraft.visibility || (updatedDraft.visibility !== "broadcast" && updatedDraft.visibility !== "direct")) {
        const prisma = getPrisma();
        assistantText = await getQuestionForFieldEnhanced(prisma, "visibility");
      } else {
        assistantText = "Everything looks good. Want me to send this out for pricing?";
      }
    } else if (finalDispatchStatus === "CONFIRMED" || finalDispatchStatus === "DISPATCHING") {
      // Confirmed and dispatching
      assistantText = "Sending your request to suppliers now...";
    } else if (finalDispatchStatus === "DISPATCHED") {
      // Check if dispatch happened on this turn or was already dispatched before
      if (didDispatchThisTurn) {
        assistantText = "Sent — I'll notify you when bids arrive.";
      } else {
        assistantText = "Already sent — I'll notify you when bids arrive.";
      }
    } else {
      // Draft is complete but unknown dispatch state - use generic confirmation prompt
      assistantText = "Everything looks good. Want me to send this out for pricing?";
    }
    
    // Ensure we always have assistantText (non-negotiable)
    if (!assistantText || assistantText.trim().length === 0) {
      // Last-ditch safeguard (should never happen)
      assistantText = "What else do you need?";
    }
    
    // Map procurementStatus missingRequired to slot names for response
    // CRITICAL: Use canonical needBy (not neededBy) - matches computeProcurementStatus
    const missingSlots = procurementStatus.missingRequired;
    const latency = Date.now() - startTime;
    console.log(`[AGENT_TURN] ${requestId} Procurement ${procurementStatus.isReadyToConfirm ? "ready" : "intake"} | userId=${user.id} | latency=${latency}ms | mode=${finalMode} | missingSlots=${missingSlots.length} | nextQuestionId=${procurementStatus.nextQuestionId || "null"}`);

    // LOG: Outgoing draftPatch
    if (process.env.NODE_ENV === "development") {
      console.log(`[AGENT_TURN] ${requestId} OUTGOING_DRAFT_PATCH`, {
        draftPatchKeys: Object.keys(draftPatch),
        hasLineItems: Array.isArray(draftPatch.lineItems) && draftPatch.lineItems.length > 0,
        lineItemsCount: Array.isArray(draftPatch.lineItems) ? draftPatch.lineItems.length : 0,
        nextQuestionId: procurementStatus.nextQuestionId || undefined,
        isReadyToConfirm: procurementStatus.isReadyToConfirm,
      });
    }

    // CRITICAL: Always include idempotency markers in draftPatch to prevent re-processing
    // NOTE: __lastAskedSlot and __resolvedSlots are no longer used - removed
    const finalDraftPatch = {
      ...draftPatch,
      __lastUserMessageId: userMessageId, // Primary idempotency key
      __lastUserMessageHash: messageHash, // Secondary idempotency key (hash-based)
    };
    
    // Dev-only resolution debug log
    if (process.env.NODE_ENV === "development") {
      console.log(`[AGENT_TURN] ${requestId} RESOLUTION_DEBUG`, {
        nextQuestionId: procurementStatus.nextQuestionId,
        isReadyToConfirm: procurementStatus.isReadyToConfirm,
        missingRequired: procurementStatus.missingRequired,
        missingSlots,
        draftPatchKeys: Object.keys(draftPatch),
      });
    }
    
    // CRITICAL: Persist messages, draftPatch, and statePatch BEFORE returning
    // This ensures every successful turn is persisted to the thread
    // CRITICAL: Dispatch status must be persisted to ThreadState, NOT to draft
    const persistResult = await persistTurn(
      threadId,
      userMessageId,
      message,
      assistantText,
      clientTurnId,
      finalDraftPatch,
      user.id,
      requestId,
      statePatch // Pass statePatch to persist ThreadState updates
    );
    
    // DEV invariant: Check if assistant text claims "sent/dispatched" without DISPATCHED status
    if (process.env.NODE_ENV === "development") {
      const lowerText = assistantText.toLowerCase();
      const claimsSent = lowerText.includes("sent") || lowerText.includes("dispatched") || lowerText.includes("waiting on bids");
      if (claimsSent && finalDispatchStatus !== "DISPATCHED") {
        console.warn("[READINESS_VIOLATION] Assistant text claims 'sent/dispatched' but ThreadState.dispatch.status !== 'DISPATCHED'", {
          threadId,
          dispatchStatus: finalDispatchStatus,
          assistantText,
        });
      }
    }
    
    // INVARIANT: threadState.mode must match persisted state
    if (statePatch?.mode && statePatch.mode !== threadState?.mode) {
      console.error(`[AGENT_TURN] ${requestId} ThreadState desync: mode mismatch`, {
        statePatchMode: statePatch.mode,
        threadStateMode: threadState?.mode,
        threadId,
      });
      // Fix the mismatch by updating threadState to match statePatch
      threadState = { ...(threadState ?? getDefaultThreadState()), mode: statePatch.mode };
    }

    if (!persistResult.ok) {
      if (process.env.NODE_ENV === "development") {
        return jsonError("PERSISTENCE_FAILED", persistResult.error || "Failed to persist turn", 500);
      }
      // In production, still return success but log the error
      console.error(`[AGENT_TURN] ${requestId} PERSISTENCE_FAILED (non-blocking in prod)`, persistResult.error);
    }
    
    return NextResponse.json({
      ok: true,
      mode: executionMode === "PROCUREMENT" ? "procurement" : "advice", // Single authoritative executionMode
      assistantText,
      draftPatch: finalDraftPatch,
      missing: missingSlots,
      ready: procurementStatus.isReadyToConfirm,
        debug: {
          provider: finalMode === "llm" ? "openai" : "offline",
          offline: finalMode !== "llm",
          reason: finalMode !== "llm" ? offlineReason : undefined,
        },
      });
  });
}
