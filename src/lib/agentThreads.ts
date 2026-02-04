"use client";

/**
 * ⚠️ FROZEN FOUNDATION — Do not modify without explicit approval
 * 
 * This file implements the core Agent Thread persistence layer.
 * It is a stable platform layer that future features build on top of, not inside.
 * 
 * FROZEN INVARIANTS:
 * - thread.draft is the ONLY canonical draft source (persisted, thread-scoped)
 * - applyDraftPatch is the ONLY merge point for draft updates
 * - NO localStorage/sessionStorage usage is allowed
 * - All operations are async and API-backed
 * - Draft keys are whitelisted (canonical keys only)
 * 
 * Changes to this file require:
 * 1. Design review for any behavior changes
 * 2. Test updates for any logic changes
 * 3. Documentation updates for any API changes
 */

/**
 * Agora Agent Threads - Chat conversation management
 * 
 * ARCHITECTURE: API-backed persistence (async)
 * 
 * All operations are async and route through /api/agent/threads endpoints.
 * NO localStorage, NO sessionStorage for threads/drafts.
 * 
 * Threads and drafts persist in database via Prisma.
 * 
 * ⚠️ DRAFT CANONICALIZATION INVARIANTS:
 * - thread.draft is the SINGLE SOURCE OF TRUTH for draft data
 * - applyDraftPatch() is the ONLY canonical merge point
 * - Legacy keys (requestedDate, location, category) are NEVER persisted
 * - Only ALLOWED_DRAFT_KEYS are stored in thread.draft
 * - No localStorage/sessionStorage usage is allowed
 */

import { labelToCategoryId, categoryIdToLabel } from "@/lib/categoryIds";
import { fetchJson } from "@/lib/clientFetch";
import type { IntentAssessment } from "./types";

export interface ThreadMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: number; // Unix timestamp in ms
}

/**
 * CANONICAL DRAFT STRUCTURE
 * 
 * thread.draft is the SINGLE SOURCE OF TRUTH for draft data.
 * It is persisted, thread-scoped, and survives refresh.
 * 
 * All draft operations must go through applyDraftPatch() or replaceDraft().
 * 
 * CANONICAL KEYS ONLY - see ALLOWED_DRAFT_KEYS constant below.
 * Legacy keys (category, requestedDate, location) are NEVER persisted.
 */
export interface ThreadDraft {
  // Canonical field names (ONLY these are persisted)
  categoryId?: string; // Canonical category ID (e.g., "roofing")
  categoryLabel?: string; // Display label (derived from categoryId if missing)
  fulfillmentType?: "PICKUP" | "DELIVERY";
  needBy?: string; // Canonical: when materials are needed (ISO date string)
  deliveryAddress?: string; // Canonical: delivery location
  jobNameOrPo?: string; // Job name or PO number
  notes?: string;
  lineItems?: Array<{
    description: string;
    unit: string;
    quantity: number;
  }>;
  conversationMode?: "procurement" | "advice" | undefined;
  visibility?: "broadcast" | "direct"; // Routing mode: broadcast = reverse auction, direct = preferred suppliers
  targetSupplierIds?: string[]; // For direct visibility: list of supplier IDs
  __lastAskedSlot?: string; // Agent turn tracking
  __lastUserMessageHash?: string; // Hash of last processed user message (prevents re-processing)
  __resolvedSlots?: string[]; // Array of resolved/locked slot keys
}

/**
 * STRICT WHITELIST: Only these keys are allowed in canonical drafts
 * Any other keys (legacy, typos, unknown) will be stripped
 */
const ALLOWED_DRAFT_KEYS = [
  "categoryId",
  "categoryLabel",
  "fulfillmentType",
  "needBy",
  "deliveryAddress",
  "jobNameOrPo",
  "notes",
  "lineItems",
  "conversationMode",
  "visibility",
  "targetSupplierIds",
  "__lastAskedSlot",
  "__lastUserMessageHash",
  "__resolvedSlots",
] as const;

/**
 * Legacy key mappings (input only - never persisted)
 * Maps all known legacy/alias keys to canonical keys
 */
const LEGACY_KEY_MAP: Record<string, string> = {
  requestedDate: "needBy",
  neededBy: "needBy",
  location: "deliveryAddress",
  address: "deliveryAddress",
  category: "categoryLabel",
  // Also handle snake_case variants
  requested_date: "needBy",
  delivery_address: "deliveryAddress",
};

export interface AgentThread {
  id: string;
  title: string;
  createdAt: number; // Unix timestamp in ms
  updatedAt: number; // Unix timestamp in ms
  messages: ThreadMessage[];
  draft: ThreadDraft;
  intent?: IntentAssessment;
}

/**
 * Convert API thread format (ISO timestamps) to internal format (Unix timestamps)
 */
function apiThreadToInternal(apiThread: any): AgentThread {
  return {
    id: apiThread.id,
    title: apiThread.title || "New chat",
    createdAt: new Date(apiThread.createdAt).getTime(),
    updatedAt: new Date(apiThread.updatedAt).getTime(),
    messages: (apiThread.messages || []).map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || new Date(msg.createdAt || Date.now()).getTime(),
    })),
    draft: apiThread.draft || {},
    intent: apiThread.intent || undefined,
  };
}

/**
 * Get all threads from API
 */
export async function getThreads(): Promise<AgentThread[]> {
  try {
    const response = await fetchJson("/api/agent/threads", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok || !response.json) {
      return [];
    }

    const data = response.json?.data || response.json || [];
    return Array.isArray(data) ? data.map(apiThreadToInternal) : [];
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getThreads] Error:", error);
    }
    return [];
  }
}

/**
 * Get threads sorted by updatedAt (most recent first)
 */
export async function getSortedThreads(): Promise<AgentThread[]> {
  const threads = await getThreads();
  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Create a new thread
 */
export async function createThread(title: string = "New chat"): Promise<AgentThread> {
  try {
    const response = await fetchJson("/api/agent/threads", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      // Extract error message with better fallback logic
      let errorMessage = "Failed to create thread";
      
      if (response.json) {
        // API returns { ok: false, error: string, message: string, code: string }
        errorMessage = response.json.message || 
                      response.json.error || 
                      response.json.code ||
                      (typeof response.json === "string" ? response.json : JSON.stringify(response.json));
      } else if (response.text) {
        // Try to parse text as JSON if json is null
        try {
          const parsed = JSON.parse(response.text);
          errorMessage = parsed.message || parsed.error || parsed.code || errorMessage;
        } catch {
          // If parsing fails, use text directly (truncated)
          errorMessage = response.text.slice(0, 200) || errorMessage;
        }
      }
      
      // Log detailed error info for debugging
      const errorDetails: any = {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        hasJson: !!response.json,
        textPreview: response.text?.slice(0, 200),
        errorMessage,
      };
      
      if (response.json) {
        errorDetails.jsonKeys = Object.keys(response.json);
        errorDetails.jsonValue = response.json;
        errorDetails.jsonString = JSON.stringify(response.json);
      }
      
      console.error("[createThread] API error:", errorDetails);
      
      throw new Error(errorMessage);
    }

    if (!response.json) {
      console.error("[createThread] No JSON in response:", {
        status: response.status,
        ok: response.ok,
        text: response.text?.slice(0, 200),
      });
      throw new Error("Invalid response from server");
    }

    // API returns { ok: true, data: { ... } }
    const data = response.json?.data || response.json;
    if (!data) {
      console.error("[createThread] No data in response:", {
        json: response.json,
        status: response.status,
      });
      throw new Error("No thread data in response");
    }

    return apiThreadToInternal(data);
  } catch (error) {
    // Re-throw if it's already an Error with a message
    if (error instanceof Error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[createThread] Error:", {
          message: error.message,
          stack: error.stack,
          errorType: error.constructor.name,
          errorString: String(error),
        });
      }
      throw error;
    }
    
    // Handle non-Error objects
    const errorMessage = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : error && typeof error === "string"
      ? error
      : "Unknown error occurred";
    
    if (process.env.NODE_ENV === "development") {
      console.error("[createThread] Non-Error caught:", {
        error,
        errorType: typeof error,
        errorMessage,
      });
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Get a thread by ID
 */
export async function getThread(threadId: string): Promise<AgentThread | null> {
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok || !response.json) {
      return null;
    }

    const data = response.json?.data || response.json;
    return apiThreadToInternal(data);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getThread] Error:", error);
    }
    return null;
  }
}

/**
 * Delete a thread
 */
export async function deleteThread(threadId: string): Promise<void> {
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[deleteThread] Failed:", response.status);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[deleteThread] Error:", error);
    }
  }
}

/**
 * Rename a thread
 */
export async function renameThread(threadId: string, newTitle: string): Promise<void> {
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({
        op: "setTitle",
        title: newTitle.trim() || "New chat",
      }),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[renameThread] Failed:", response.status);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[renameThread] Error:", error);
    }
  }
}

/**
 * Append a message to a thread
 * Rejects duplicate message IDs to enforce idempotency
 */
export async function appendMessage(threadId: string, message: ThreadMessage): Promise<void> {
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({
        op: "appendMessage",
        message,
      }),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[appendMessage] Failed:", response.status);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[appendMessage] Error:", error);
    }
  }
}

/**
 * Get canonical draft for a thread
 * thread.draft IS the canonical source of truth (persisted, thread-scoped)
 * 
 * Returns ONLY canonical keys (strips any legacy keys that might exist)
 * NO legacy aliases are injected - pure canonical only
 */
export async function getDraft(threadId: string): Promise<ThreadDraft> {
  const thread = await getThread(threadId);
  if (!thread) return {};

  const draft = { ...thread.draft };

  // Defensive cleanup: remove any legacy keys that might exist
  for (const legacyKey of Object.keys(LEGACY_KEY_MAP)) {
    delete (draft as any)[legacyKey];
  }

  // Remove any unknown keys (defensive)
  const draftKeys = Object.keys(draft);
  for (const key of draftKeys) {
    if (!ALLOWED_DRAFT_KEYS.includes(key as any)) {
      delete (draft as any)[key];
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[agentThreads] Removed unknown key "${key}" from getDraft for thread ${threadId}`
        );
      }
    }
  }

  // Dev-only invariant assertion
  assertCanonicalDraft(threadId, draft, "getDraft");

  return draft;
}

/**
 * Replace draft for a thread - FULL REPLACEMENT ONLY
 * 
 * thread.draft IS the canonical source of truth.
 * This function completely replaces it.
 */
export async function replaceDraft(threadId: string, draft: ThreadDraft): Promise<void> {
  // Use applyDraftPatch with full draft as patch (replaces everything)
  await applyDraftPatch(threadId, draft);
}

/**
 * Sanitize draft patch: maps legacy keys to canonical, whitelists only canonical keys
 */
function sanitizeDraftPatch(patch: any): Partial<ThreadDraft> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {};
  }

  const sanitized: Partial<ThreadDraft> = {};

  // Step 1: Map legacy keys to canonical (only if canonical is absent in patch)
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (patch[legacyKey] !== undefined && patch[canonicalKey] === undefined) {
      const value = patch[legacyKey];
      if (value !== null && value !== "") {
        (sanitized as any)[canonicalKey] = value === "" ? undefined : value;
      }
    }
  }

  // Step 2: Copy allowed canonical keys from patch
  for (const key of ALLOWED_DRAFT_KEYS) {
    if (patch[key] !== undefined) {
      const value = patch[key];
      
      // Never write null; use undefined to unset
      if (value === null) {
        continue; // Skip null values
      }
      
      // Normalize empty strings to undefined
      if (value === "") {
        continue; // Skip empty strings
      }
      
      // Special handling for lineItems: normalize to canonical {description, quantity, unit}
      if (key === "lineItems") {
        if (Array.isArray(value)) {
          sanitized.lineItems = value.map((item: any) => ({
            description: item.description || item.name || item.sku || "",
            quantity: typeof item.quantity === "number" ? item.quantity : (typeof item.qty === "number" ? item.qty : 0),
            unit: item.unit || item.uom || "EA",
          }));
        } else {
          sanitized.lineItems = [];
        }
      } else {
        (sanitized as any)[key] = value;
      }
    }
  }

  // Step 3: Ensure categoryLabel is present when categoryId exists
  if (sanitized.categoryId && !sanitized.categoryLabel) {
    try {
      sanitized.categoryLabel = categoryIdToLabel[sanitized.categoryId as keyof typeof categoryIdToLabel] || sanitized.categoryId;
    } catch {
      sanitized.categoryLabel = sanitized.categoryId;
    }
  }

  // Step 4: If categoryLabel is set, also set categoryId using labelToCategoryId when possible
  if (sanitized.categoryLabel && !sanitized.categoryId) {
    const cid = labelToCategoryId[sanitized.categoryLabel as keyof typeof labelToCategoryId];
    if (cid) {
      sanitized.categoryId = cid;
    }
  }

  // Log dropped keys in development
  if (process.env.NODE_ENV === "development") {
    const patchKeys = Object.keys(patch);
    const droppedKeys = patchKeys.filter(
      (k) => !ALLOWED_DRAFT_KEYS.includes(k as any) && !LEGACY_KEY_MAP[k]
    );
    if (droppedKeys.length > 0) {
      console.warn(
        `[agentThreads] Dropped unknown/typo keys from patch:`,
        droppedKeys
      );
    }
  }

  return sanitized;
}

/**
 * Dev-only invariant assertion: verify draft contains NO legacy keys and NO unknown keys
 */
function assertCanonicalDraft(threadId: string, draft: ThreadDraft, operation: string): void {
  if (process.env.NODE_ENV !== "development") return;

  const draftKeys = Object.keys(draft);
  const legacyKeys = draftKeys.filter((k) => k in LEGACY_KEY_MAP);
  const unknownKeys = draftKeys.filter((k) => !ALLOWED_DRAFT_KEYS.includes(k as any));

  if (legacyKeys.length > 0 || unknownKeys.length > 0) {
    console.error(
      `[agentThreads] INVARIANT VIOLATION in ${operation} for thread ${threadId}:`,
      {
        legacyKeys,
        unknownKeys,
        allKeys: draftKeys,
      }
    );
  }
}

/**
 * ⚠️ FROZEN INVARIANT: THE ONLY CANONICAL MERGE POINT
 * 
 * Applies a patch to thread.draft (the canonical source).
 * This is the ONLY place where merge semantics are allowed.
 * 
 * CRITICAL INVARIANTS:
 * - thread.draft is the ONLY canonical draft source (persisted, thread-scoped)
 * - applyDraftPatch is the ONLY merge point for draft updates
 * - Legacy keys are NEVER persisted (mapped to canonical keys)
 * - Unknown keys are stripped (only ALLOWED_DRAFT_KEYS are stored)
 * - NO localStorage/sessionStorage usage is allowed
 * 
 * DO NOT:
 * - Create alternative merge points
 * - Bypass canonicalization
 * - Store legacy keys in thread.draft
 * - Use localStorage/sessionStorage for drafts
 */
export async function applyDraftPatch(threadId: string, patch: Partial<ThreadDraft> | any): Promise<ThreadDraft> {
  const thread = await getThread(threadId);
  if (!thread) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(`[agentThreads] applyDraftPatch: thread ${threadId} not found`);
    }
    return {};
  }

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(`[agentThreads] applyDraftPatch requires a plain object patch`);
    }
    return getDraft(threadId);
  }

  // Get current draft (returns copy, already cleaned of legacy keys)
  const currentDraft = await getDraft(threadId);

  // Sanitize patch (strict whitelist, maps legacy->canonical, drops unknown keys)
  const sanitizedPatch = sanitizeDraftPatch(patch);

  // Apply patch with controlled merge (only canonical keys)
  const merged: ThreadDraft = { ...currentDraft };

  // Apply each sanitized patch field
  for (const key of ALLOWED_DRAFT_KEYS) {
    if (key in sanitizedPatch) {
      const value = (sanitizedPatch as any)[key];
      if (value === undefined || value === null || value === "") {
        // Unset field
        delete merged[key as keyof ThreadDraft];
      } else {
        (merged as any)[key] = value;
      }
    }
  }

  // Cleanup pass: remove any legacy keys that may already exist on stored draft
  for (const legacyKey of Object.keys(LEGACY_KEY_MAP)) {
    if ((merged as any)[legacyKey] !== undefined) {
      delete (merged as any)[legacyKey];
    }
  }

  // Remove any unknown keys (defensive)
  const mergedKeys = Object.keys(merged);
  for (const key of mergedKeys) {
    if (!ALLOWED_DRAFT_KEYS.includes(key as any)) {
      delete (merged as any)[key];
    }
  }

  // Write full replacement back to thread.draft via API
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({
        op: "applyDraftPatch",
        patch: merged,
      }),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[applyDraftPatch] Failed to save:", response.status);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[applyDraftPatch] Error:", error);
    }
  }

  return merged;
}

/**
 * Clear draft for a thread
 */
export async function clearDraft(threadId: string): Promise<void> {
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({
        op: "clearDraft",
      }),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[clearDraft] Failed:", response.status);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[clearDraft] Error:", error);
    }
  }
}

/**
 * @deprecated Use replaceDraft or applyDraftPatch
 */
export async function updateDraft(threadId: string, draft: ThreadDraft): Promise<void> {
  await replaceDraft(threadId, draft);
}

/**
 * Update intent assessment for a thread
 */
export async function updateIntent(threadId: string, intent: IntentAssessment | null): Promise<void> {
  const thread = await getThread(threadId);
  if (!thread) return;

  // Guard: only update if intent actually changed
  const currentIntentKey = thread.intent ? JSON.stringify(thread.intent) : "";
  const newIntentKey = intent ? JSON.stringify(intent) : "";
  
  if (currentIntentKey === newIntentKey) {
    // No change - skip update
    return;
  }

  // Update meta field with intent
  try {
    const response = await fetchJson(`/api/agent/threads/${threadId}`, {
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({
        op: "updateMeta",
        meta: { intent },
      }),
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[updateIntent] Failed:", response.status);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[updateIntent] Error:", error);
    }
  }
}

/**
 * Auto-title a thread based on first user message
 */
export async function autoTitleThread(threadId: string, firstMessage: string): Promise<void> {
  const thread = await getThread(threadId);
  if (!thread || thread.title !== "New chat") return; // Only auto-title if still "New chat"

  // Extract first 4-6 words, trim to reasonable length
  const words = firstMessage.trim().split(/\s+/).slice(0, 6);
  const snippet = words.join(" ");
  const title = snippet.length > 50 ? snippet.substring(0, 47) + "..." : snippet;

  if (title) {
    await renameThread(threadId, title);
  }
}

// Legacy exports for backward compatibility (deprecated)
export const THREADS_STORAGE_KEY = "DEPRECATED: Use API";
export const ACTIVE_THREAD_ID_KEY = "DEPRECATED: Use API";

/**
 * @deprecated Active thread ID should be managed in UI state, not localStorage
 */
export async function getActiveThreadId(): Promise<string | null> {
  // Return null - active thread should be managed in component state
  return null;
}

/**
 * @deprecated Active thread ID should be managed in UI state, not localStorage
 */
export async function setActiveThreadId(threadId: string | null): Promise<void> {
  // No-op - active thread should be managed in component state
}
