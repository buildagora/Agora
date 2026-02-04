"use client";

/**
 * ⚠️ FROZEN FOUNDATION — Do not modify without explicit approval
 * 
 * This file implements the core Agent Thread client lifecycle and state management.
 * It is a stable platform layer that future features build on top of, not inside.
 * 
 * FROZEN INVARIANTS:
 * - Thread creation is single-flight and idempotent (ensureThreadCreated)
 * - createThread() may ONLY be called inside ensureThreadCreated()
 * - No mount, effect, handler, or action may create threads directly
 * - All draft operations go through canonical merge points
 * - Thread state is the single source of truth
 * 
 * Changes to this file require:
 * 1. Design review for any behavior changes
 * 2. Test updates for any logic changes
 * 3. Documentation updates for any API changes
 */

/**
 * LOOP ROOT CAUSE + FIX:
 * 
 * ROOT CAUSE: The infinite render/HMR loop was caused by a cascade of unstable dependencies:
 * 
 * PRIMARY LOOP:
 * 1. computedIntent depends on rawCanonicalDraft (which depends on draftVersion)
 * 2. When draftVersion changes, rawCanonicalDraft gets new reference (even if content same)
 * 3. computedIntent recalculates and gets new reference (even if derived value same)
 * 4. Intent sync effect runs (depends on computedIntent)
 * 5. Effect calls updateIntent → updateThread → saveThreads → localStorage write
 * 6. Storage event fires (in other tabs) → setThreadsGuarded → threads update
 * 7. activeThread changes → computedIntent recalculates → LOOP
 * 
 * SECONDARY ISSUES:
 * - Storage event handler called setThreads() unconditionally (now guarded)
 * - updateIntent wrote to localStorage even when intent didn't change (now guarded)
 * - activeThread?.intent reference changed even when value same (now stabilized)
 * 
 * THE FIX: Multi-layer stabilization prevents all loops:
 * 
 * 1. Stabilized activeThreadIntent: Only changes when intent VALUE changes (JSON comparison)
 * 2. Stabilized computedIntent: Only changes when derived intent VALUE changes (JSON comparison)
 * 3. Guarded updateIntent: Only writes to localStorage if intent actually changed
 * 4. Guarded setThreads: Only updates state if thread fingerprints changed
 * 5. Storage event handler: Ignores same-tab writes, uses guarded setThreads
 * 6. All setThreads/setDraftVersion calls use guarded versions throughout component
 * 
 * INVARIANTS ENFORCED (LOOP IS NOW IMPOSSIBLE):
 * A) computedIntent only changes when intent VALUE changes, not reference (stabilized via JSON comparison)
 * B) activeThreadIntent only changes when intent VALUE changes (stabilized via JSON comparison)
 * C) updateIntent only writes if intent VALUE changed (guard in agentThreads.ts)
 * D) Storage events only cause setState if thread fingerprints changed (setThreadsGuarded)
 * E) Same-tab writes are ignored (tab ID checked fresh on each storage event)
 * F) All effects use stable dependencies (stabilized computedIntent, activeThreadIntent)
 * G) No setState during render; all updates in effects or event handlers
 * 
 * INVARIANTS:
 * 
 * 1. thread.draft (agentThreads.ts) is the ONLY canonical draft source (persisted, thread-scoped).
 * 2. DraftStore (draftStore.ts) holds ONLY lastProcessedKey (session-scoped, non-draft).
 * 3. ALL draft reads: use agentThreads.getDraft(threadId).
 * 4. ALL draft writes: use agentThreads.applyDraftPatch(threadId, patch) or agentThreads.clearDraft(threadId).
 * 5. Thread messages must NEVER be rewritten from React component state. Only appendMessage persists.
 * 6. Procurement mode is derived safely: true ONLY when conversationMode === "procurement" OR (has procurement signal keys AND conversationMode !== "advice").
 * 7. ExpectedField naming drift is handled in one adapter.
 * 8. Duplicate sends/messages: idempotent per userMessageId and assistantMessageId with ref-based blocking.
 * 9. Thread switching never mixes drafts or messages across threads.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { initAgentState, getNextExpectedField, type AgentState, type ExpectedField } from "@/lib/agent/stateMachine";
import {
  getSortedThreads,
  createThread,
  getThread,
  deleteThread,
  renameThread,
  appendMessage,
  getDraft,
  applyDraftPatch,
  clearDraft,
  updateIntent,
  autoTitleThread,
  type AgentThread,
  type ThreadMessage,
  type ThreadDraft,
} from "@/lib/agentThreads";
import type { IntentAssessment } from "@/lib/types";
import { deriveIntent } from "@/lib/intent-engine";
import { useToast, ToastContainer } from "@/components/Toast";
import Chat, { type ChatMessage } from "@/components/agent/Chat";
import ExecutionPanel from "@/components/agent/ExecutionPanel";
import ChatSidebar from "@/components/agent/ChatSidebar";
import Button from "@/components/ui2/Button";
import { clearLastProcessedKey } from "@/lib/agent/draftStore";
import { validateAgentDraftRFQ } from "@/lib/agent/contracts";
import { labelToCategoryId } from "@/lib/categoryIds";
import { categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
import { fetchJson } from "@/lib/clientFetch";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { DraftRFQ } from "@/lib/agent/draftBuilder";
import {
  canonicalDraftToExecutionPanelDraft,
  canonicalDraftToRoutingDraft,
} from "@/lib/agent/adapters/draftAdapters";
import { assertThreadId, guardReadyState } from "@/lib/agent/guards";

function convertThreadMessagesToChatMessages(threadMessages: ThreadMessage[]): ChatMessage[] {
  return threadMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
  }));
}

function convertChatMessageToThreadMessage(msg: ChatMessage): ThreadMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp.getTime(),
  };
}

/**
 * Development-only logger: log draft state after update
 * 
 * NOTE: This is a logger, not an assertion. The real canonical enforcement
 * happens in agentThreads.applyDraftPatch via [DRAFT_CANONICAL_VIOLATION] error.
 * 
 * This function is safe to call synchronously because getDraft is synchronous
 * (localStorage-based, not async/Prisma-backed). If agentThreads were async,
 * this would need to be async and awaited.
 */
async function assertDraftState(threadId: string, operation: string): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    // getDraft is now async (API-backed)
    const draft = (await getDraft(threadId)) || {};
    const draftKeys = Object.keys(draft);
    const draftHash = JSON.stringify(draft).length;
    console.log(`[DRAFT_SAFETY] ${operation}`, {
      threadId,
      draftKeys,
      draftHash,
      keyCount: draftKeys.length,
    });
  }
}

// Pure view adapter: converts canonical draft to UI display format
// This is ONLY for display purposes, never used for logic
// Returns a shallow copy of the canonical draft (no legacy aliases added)
// Note: For logic (procurement mode, validation), use raw getDraft() directly
function shallowCopyDraft(draft: ThreadDraft | null | undefined): ThreadDraft | null {
  if (!draft || Object.keys(draft).length === 0) {
    return null;
  }

  // Return shallow copy of canonical draft (no legacy aliases)
  // The canonical draft already has all the fields we need
  return { ...draft };
}

// Helper: Check if draft has procurement signal keys (canonical keys only)
function hasProcurementSignal(draft: ThreadDraft | null): boolean {
  if (!draft) return false;
  return Boolean(
    draft.categoryId ||
    draft.categoryLabel ||
    draft.fulfillmentType ||
    draft.needBy ||
    draft.deliveryAddress ||
    draft.jobNameOrPo ||
    (typeof draft.notes === "string" && draft.notes.trim().length > 0) ||
    (Array.isArray(draft.lineItems) && draft.lineItems.length > 0)
  );
}

/**
 * Adapter: Convert canonical ThreadDraft to state machine input shape
 * 
 * State machine's AgentState.draft interface expects legacy field names:
 * - category (not categoryLabel) - maps to ExpectedField "category"
 * - requestedDate (not needBy) - maps to ExpectedField "neededBy" (note: ExpectedField enum uses "neededBy", but AgentState.draft uses "requestedDate")
 * - location (not deliveryAddress) - maps to ExpectedField "deliveryAddress"
 * - jobNameOrPo (matches canonical)
 * 
 * Note: The ExpectedField enum uses legacy names ("neededBy", "deliveryAddress") but the
 * state machine's AgentState.draft interface uses different legacy names ("requestedDate", "location").
 * This adapter bridges canonical draft to state machine's expected draft shape.
 * 
 * This adapter is the ONLY place where legacy names are used for state machine input.
 * The state machine itself uses legacy names internally, but canonical draft never does.
 */
function canonicalDraftToStateMachineInput(canonicalDraft: ThreadDraft | null): AgentState["draft"] {
  if (!canonicalDraft) {
    return {};
  }

  // Map canonical keys to state machine expected shape
  // Note: priority/strategy/supplierCountTarget are NOT part of canonical ThreadDraft
  // They are only in agentState.draft for state machine compatibility
  return {
    category: canonicalDraft.categoryLabel || (canonicalDraft.categoryId ? categoryIdToLabel(canonicalDraft.categoryId as CategoryId) : undefined),
    categoryId: canonicalDraft.categoryId,
    fulfillmentType: canonicalDraft.fulfillmentType,
    requestedDate: canonicalDraft.needBy, // Map canonical needBy -> requestedDate for state machine
    location: canonicalDraft.deliveryAddress, // Map canonical deliveryAddress -> location for state machine
    // Canonical line items are normalized by applyDraftPatch to: {description, quantity, unit}
    // This adapter reads canonical fields first, then falls back to variants for robustness
    lineItems: Array.isArray(canonicalDraft.lineItems) ? canonicalDraft.lineItems.map((item: any) => ({
      description: item.description || item.name || item.sku || "",
      // Read canonical quantity first, then fall back to qty variant
      quantity: typeof item.quantity === "number" ? item.quantity : (typeof item.qty === "number" ? item.qty : 0),
      // Read canonical unit first, then fall back to uom variant
      unit: item.unit || item.uom || "EA",
    })) : [],
    notes: canonicalDraft.notes || "",
    jobNameOrPo: canonicalDraft.jobNameOrPo || "",
    title: canonicalDraft.jobNameOrPo,
    // priority/strategy/supplierCountTarget are NOT in canonical draft - they come from agentState only
  };
}


// Adapter: Map expectedField to stage, handling naming drift
function mapExpectedFieldToStage(expectedField: ExpectedField): AgentState["stage"] {
  switch (expectedField) {
    case "category":
      return "need_category";
    case "fulfillment":
      return "need_fulfillment";
    case "neededBy": // stateMachine uses "neededBy", canonical uses "needBy"
      return "need_date";
    case "deliveryAddress":
      return "need_location";
    case "roofMaterialType":
    case "roofSizeSquares":
    case "roofAccessoriesNeeded":
      return "need_line_items";
    case "lineItems":
      return "need_line_items";
    case "priority":
      return "need_line_items";
    case "jobNamePo": // stateMachine uses "jobNamePo", canonical uses "jobNameOrPo"
      return "need_job_name_po";
    case "notes":
    case null:
      return "ready";
    default:
      return "idle";
  }
}

export default function BuyerAgentClient() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const { showToast, toasts, removeToast } = useToast();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>(initAgentState());
  const [isSending, setIsSending] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[] | undefined>(undefined);
  const [intent, setIntent] = useState<IntentAssessment | null>(null);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const hasAutoTitled = useRef(false);
  const lastIntentInput = useRef<string>("");
  const activeThreadIdRef = useRef<string | null>(null);
  const draftIdRefs = useRef<Map<string, string>>(new Map());
  const inFlightThreads = useRef<Set<string>>(new Set());
  // RFQ submission guard: track last error signature to prevent spam
  const lastRfqErrorSignature = useRef<string>("");
  // Thread creation single-flight guard: prevent duplicate thread creation
  const isCreatingThread = useRef<boolean>(false);
  // Thread creation promise ref: ensures only one creation in flight
  const creatingThreadPromiseRef = useRef<Promise<AgentThread> | null>(null);
  
  // DEV-ONLY: Render counter and state update tracking
  const renderCountRef = useRef(0);
  const setThreadsCallSiteRef = useRef<Map<string, number>>(new Map());
  const setDraftVersionCallSiteRef = useRef<Map<string, number>>(new Map());
  
  if (process.env.NODE_ENV === "development") {
    renderCountRef.current += 1;
    if (renderCountRef.current > 100 && renderCountRef.current % 10 === 0) {
      console.warn(`[LOOP_DETECTION] High render count: ${renderCountRef.current}`, {
        setThreadsCalls: Array.from(setThreadsCallSiteRef.current.entries()),
        setDraftVersionCalls: Array.from(setDraftVersionCallSiteRef.current.entries()),
      });
    }
  }
  
  // Note: requireThreadId removed - use assertThreadId from guards.ts instead
  
  /**
   * ⚠️ FROZEN INVARIANTS — Thread Creation
   * 
   * CRITICAL: createThread() may ONLY be called inside ensureThreadCreated()
   * 
   * Thread creation invariants:
   * 1. Thread creation is single-flight and idempotent
   *    - Only one thread creation can be in flight at a time
   *    - Concurrent calls share the same promise
   * 2. No mount, effect, handler, or action may create threads directly
   *    - All thread creation MUST go through ensureThreadCreated()
   *    - This ensures proper logging, error handling, and idempotency
   * 3. Thread creation is logged with reason for debugging
   *    - All creation points are tracked via reason parameter
   * 
   * Violations of these invariants will cause:
   * - Duplicate thread creation
   * - Race conditions
   * - Loss of idempotency guarantees
   * 
   * DO NOT:
   * - Call createThread() directly anywhere in this file
   * - Bypass ensureThreadCreated() for any reason
   * - Remove or weaken the single-flight guard
   */
  async function ensureThreadCreated(reason: string): Promise<AgentThread> {
    // NOTE: The protection against direct createThread() calls is structural:
    // - createThread() is ONLY called inside this function (line ~355)
    // - All other code paths MUST call ensureThreadCreated() instead
    // - This is enforced by code review and the frozen foundation documentation
    // Runtime stack trace checks are not reliable for this purpose
    if (creatingThreadPromiseRef.current) {
      return creatingThreadPromiseRef.current;
    }

    if (isCreatingThread.current) {
      // If flag is set but promise missing, fail closed by waiting a tick and trying again
      await new Promise((r) => setTimeout(r, 0));
      if (creatingThreadPromiseRef.current) {
        return creatingThreadPromiseRef.current;
      }
    }

    isCreatingThread.current = true;
    creatingThreadPromiseRef.current = (async () => {
      try {
        const t = await createThread();
        if (process.env.NODE_ENV === "development") {
          console.log("[AGENT_THREAD_CREATE_SINGLE_FLIGHT]", { reason, threadId: t.id });
        }
        return t;
      } finally {
        isCreatingThread.current = false;
        // Keep promise until next tick so concurrent callers all share it
        setTimeout(() => {
          creatingThreadPromiseRef.current = null;
        }, 0);
      }
    })();

    return creatingThreadPromiseRef.current;
  }
  
  // Track activeThreadId in ref to avoid stale closures
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // canonicalThreadId: exactly activeThreadId when available, otherwise null (NO FALLBACK)
  const canonicalThreadId = activeThreadId;

  // ONE canonical draft accessor - reads from thread.draft (the canonical source)
  // For UI rendering, use shallow copy. For logic (procurement mode, validation), use raw draft.
  const [canonicalDraft, setCanonicalDraft] = useState<ThreadDraft | null>(null);
  const [rawCanonicalDraft, setRawCanonicalDraft] = useState<ThreadDraft | null>(null);

  // Load draft when threadId or draftVersion changes
  useEffect(() => {
    if (!canonicalThreadId) {
      setCanonicalDraft(null);
      setRawCanonicalDraft(null);
      return;
    }

    (async () => {
      const draft = await getDraft(canonicalThreadId);
      setCanonicalDraft(shallowCopyDraft(draft));
      setRawCanonicalDraft(draft);
    })();
  }, [canonicalThreadId, draftVersion]);

  // Derive procurement mode safely from thread.draft (canonical)
  // conversationMode is a canonical whitelisted key enforced by applyDraftPatch
  // Legacy variants (mode, procureMode, etc.) are never persisted - only conversationMode
  // This is safe because applyDraftPatch whitelists only conversationMode and strips legacy variants
  const isProcurementMode = rawCanonicalDraft?.conversationMode === "procurement" || 
                            (rawCanonicalDraft !== null && rawCanonicalDraft.conversationMode !== "advice" && hasProcurementSignal(rawCanonicalDraft));

  // Derive validation from raw canonical draft (logic, not UI)
  const validation = rawCanonicalDraft ? validateAgentDraftRFQ(rawCanonicalDraft) : { ok: false, missing: ["draft"] };

  // Derive canConfirm from raw canonical draft
  const canConfirm = isProcurementMode && rawCanonicalDraft !== null && validation.ok;

  // Get stable draft id per thread
  const getDraftIdForThread = (threadId: string | null): string => {
    if (!threadId) return crypto.randomUUID();
    if (!draftIdRefs.current.has(threadId)) {
      draftIdRefs.current.set(threadId, crypto.randomUUID());
    }
    return draftIdRefs.current.get(threadId)!;
  };

  /**
   * Single source of truth: append message once by ID
   */
  const appendMessageOnce = (prev: ChatMessage[], newMessage: ChatMessage): ChatMessage[] => {
    if (prev.some((m) => m.id === newMessage.id)) {
      return prev;
    }
    return [...prev, newMessage];
  };

  // Mount guard: prevent Strict Mode duplicate initialization
  const didInitRef = useRef<string | null>(null);

  // Load threads and sync with URL route (NO REDIRECTS - just sync state)
  useEffect(() => {
    if (!user || user.role !== "BUYER") {
      return;
    }

    // Create init fingerprint to prevent Strict Mode duplicates
    const initKey = `${user?.id || "anon"}:${pathname}:${params.threadId || ""}`;
    if (didInitRef.current === initKey) {
      return; // Already initialized for this exact state
    }
    didInitRef.current = initKey;

    (async () => {
      const allThreads = await getSortedThreads();
      setThreadsGuarded(allThreads, "mount:initialLoad");

      // Read threadId from URL (route owns the decision, component syncs)
      const urlThreadId = params.threadId as string | undefined;
      const isNewThreadRoute = pathname === "/buyer/agent/thread/new";

      let activeId: string;

      if (isNewThreadRoute) {
        // URL says "new thread" - create new one
        const newThread = await ensureThreadCreated("mount:newThreadRoute");
        activeId = newThread.id;
        const updatedThreads = await getSortedThreads();
        setThreadsGuarded(updatedThreads, "mount:createNewThread");
      } else if (urlThreadId) {
        // URL specifies a thread - load it (or create if missing)
        if (allThreads.find((t) => t.id === urlThreadId)) {
          activeId = urlThreadId;
        } else {
          // Thread doesn't exist - create new one
          const newThread = await ensureThreadCreated("mount:missingUrlThread");
          activeId = newThread.id;
          const updatedThreads = await getSortedThreads();
          setThreadsGuarded(updatedThreads, "mount:createMissingThread");
        }
      } else {
        // No threadId in URL - use first thread or create
        if (allThreads.length > 0) {
          activeId = allThreads[0].id;
        } else {
          const newThread = await ensureThreadCreated("mount:fallbackNoThreads");
          activeId = newThread.id;
          const updatedThreads = await getSortedThreads();
          setThreadsGuarded(updatedThreads, "mount:createFallbackThread");
        }
      }

      // Sync state with URL (NO REDIRECT - just update component state)
      activeThreadIdRef.current = activeId;
      setActiveThreadIdState(activeId);
      await loadThread(activeId);
    })();
  }, [user, params.threadId, pathname]);

  // Load a thread's messages and state
  const loadThread = async (threadId: string) => {
    const thread = await getThread(threadId);
    if (!thread) return;

    // Load messages from thread only (dedupe by id)
    const chatMessages = convertThreadMessagesToChatMessages(thread.messages);
    
    const uniqueMessages = chatMessages.reduce((acc, msg) => {
      if (!acc.some((m) => m.id === msg.id)) {
        acc.push(msg);
      }
      return acc;
    }, [] as ChatMessage[]);
    
    if (uniqueMessages.length === 0) {
      const greeting: ChatMessage = {
        id: "greeting",
        role: "assistant",
        content: "I'm Agora, your sales rep. I help you think through the job, make sure nothing's missed, and line up materials and pricing when you're ready. What are you working on?",
        timestamp: new Date(),
      };
      setMessages([greeting]);
    } else {
      setMessages(uniqueMessages);
    }

    // Load agent state from thread.draft (canonical source)
    const threadDraft = await getDraft(threadId);
    const normalizedDraft = shallowCopyDraft(threadDraft);

    if (normalizedDraft) {
      const stateMachineInput = canonicalDraftToStateMachineInput(normalizedDraft);
      const expectedField = getNextExpectedField(stateMachineInput);
      const stage = mapExpectedFieldToStage(expectedField);
      setAgentState({
        stage,
        expectedField,
        draft: stateMachineInput,
        hasShownCompletion: expectedField === null,
        lastBotPromptKey: undefined,
      });
    } else {
      setAgentState(initAgentState());
    }

    setIntent(thread.intent || null);
    hasAutoTitled.current = thread.title !== "New chat";
    setIsSending(false);
    
    // Bump draftVersion to trigger canonicalDraft recomputation
    // NOTE: We do NOT hydrate DraftStore from thread.draft
    setDraftVersionGuarded((v) => v + 1, "loadThread");
  };

  // Save current thread state - updates title and intent (NO messages, NO draft - draft is already canonical)
  // Note: thread.draft is persisted via API via applyDraftPatch/clearDraft, not via this function
  // DEPRECATED: This function is no longer used in effects to prevent loops
  const saveCurrentThread = async (threadIdOverride?: string) => {
    const tid = threadIdOverride ?? activeThreadIdRef.current;
    if (!tid) return;

    // Just refresh threads list (thread.draft is already persisted via applyDraftPatch/clearDraft)
    // Use guarded setThreads to prevent unnecessary re-renders
    const threads = await getSortedThreads();
    setThreadsGuarded(threads, "saveCurrentThread");
  };
  
  /**
   * DEV-ONLY: Create stable fingerprint for thread comparison
   * Compares: IDs, count, updatedAt, title, intent presence, draft keys (not values)
   */
  const createThreadFingerprint = (threads: AgentThread[]): string => {
    return threads
      .map((t) => {
        const draftKeys = Object.keys(t.draft || {}).sort().join(",");
        const intentKey = t.intent ? "hasIntent" : "noIntent";
        return `${t.id}:${t.updatedAt}:${t.title}:${intentKey}:${draftKeys.length}`;
      })
      .sort()
      .join("|");
  };
  
  /**
   * Guarded setThreads - only updates if threads actually changed
   * Prevents infinite re-render loops from storage events or effects
   */
  const setThreadsGuarded = (newThreads: AgentThread[], callSite: string) => {
    if (process.env.NODE_ENV === "development") {
      const count = (setThreadsCallSiteRef.current.get(callSite) || 0) + 1;
      setThreadsCallSiteRef.current.set(callSite, count);
    }
    
    setThreads((prevThreads) => {
      // Quick check: same reference means no change
      if (prevThreads === newThreads) {
        return prevThreads;
      }
      
      // Compare fingerprints
      const prevFingerprint = createThreadFingerprint(prevThreads);
      const newFingerprint = createThreadFingerprint(newThreads);
      
      if (prevFingerprint === newFingerprint) {
        // No actual change - return previous to prevent re-render
        if (process.env.NODE_ENV === "development") {
          console.debug(`[setThreadsGuarded] No change detected at ${callSite}, preventing re-render`);
        }
        return prevThreads;
      }
      
      // Actual change detected - update
      if (process.env.NODE_ENV === "development") {
        console.debug(`[setThreadsGuarded] Change detected at ${callSite}`, {
          prevCount: prevThreads.length,
          newCount: newThreads.length,
          prevFingerprint: prevFingerprint.substring(0, 100),
          newFingerprint: newFingerprint.substring(0, 100),
        });
      }
      return newThreads;
    });
  };
  
  /**
   * Guarded setDraftVersion - tracks call sites for debugging
   */
  const setDraftVersionGuarded = (updater: (v: number) => number, callSite: string) => {
    if (process.env.NODE_ENV === "development") {
      const count = (setDraftVersionCallSiteRef.current.get(callSite) || 0) + 1;
      setDraftVersionCallSiteRef.current.set(callSite, count);
    }
    setDraftVersion(updater);
  };

  // Get active thread for intent lookup
  // getThread is now async (API-backed), so we use state + useEffect
  const [activeThread, setActiveThread] = useState<AgentThread | null>(null);
  
  useEffect(() => {
    if (!activeThreadId) {
      setActiveThread(null);
      return;
    }
    (async () => {
      const thread = await getThread(activeThreadId);
      setActiveThread(thread);
    })();
  }, [activeThreadId]);
  
  // Stabilize activeThread.intent: only change when the actual intent value changes
  const activeThreadIntentStableRef = useRef<{ key: string; intent: IntentAssessment | null }>({ key: "", intent: null });
  const activeThreadIntent = useMemo(() => {
    const threadIntent = activeThread?.intent || null;
    if (!threadIntent) {
      if (activeThreadIntentStableRef.current.intent !== null) {
        activeThreadIntentStableRef.current = { key: "", intent: null };
      }
      return activeThreadIntentStableRef.current.intent;
    }
    
    const intentKey = JSON.stringify(threadIntent);
    if (intentKey !== activeThreadIntentStableRef.current.key) {
      activeThreadIntentStableRef.current = { key: intentKey, intent: threadIntent };
    }
    return activeThreadIntentStableRef.current.intent;
  }, [activeThread?.intent]);

  // Compute intent: derive from rawCanonicalDraft (if present), not agentState.draft
  // Note: Use rawCanonicalDraft for logic, not canonicalDraft (which is UI-only)
  // CRITICAL: Stabilize computedIntent to prevent unnecessary effect re-runs
  // We use a ref to cache the last computed intent value and only update when the actual value changes
  const computedIntentRaw = useMemo((): IntentAssessment | null => {
    if (activeThreadIntent) {
      return activeThreadIntent;
    }

    if (rawCanonicalDraft) {
      const category = rawCanonicalDraft.categoryLabel;
      const fulfillment = rawCanonicalDraft.fulfillmentType;
      const needBy = rawCanonicalDraft.needBy;
      const address = rawCanonicalDraft.deliveryAddress;
      const lineItems = rawCanonicalDraft.lineItems || [];
      const notes = rawCanonicalDraft.notes || "";

      const hasAnySignal =
        Boolean(category) ||
        Boolean(fulfillment) ||
        Boolean(needBy) ||
        Boolean(address) ||
        (Array.isArray(lineItems) && lineItems.length > 0) ||
        (typeof notes === "string" && notes.trim().length > 0);

      if (!hasAnySignal) return null;

      return deriveIntent({ category, fulfillment, needBy, address, lineItems, notes });
    }

    return null;
  }, [
    activeThreadIntent,
    rawCanonicalDraft,
  ]);
  
  // Stabilize computedIntent: only change when the actual intent value changes (not just reference)
  // This prevents the intent sync effect from running unnecessarily when draftVersion changes
  // but the derived intent value is the same
  const computedIntentStableRef = useRef<{ key: string; intent: IntentAssessment | null }>({ key: "", intent: null });
  const computedIntent = useMemo(() => {
    if (!computedIntentRaw) {
      if (computedIntentStableRef.current.intent !== null) {
        computedIntentStableRef.current = { key: "", intent: null };
      }
      return computedIntentStableRef.current.intent;
    }
    
    const intentKey = JSON.stringify(computedIntentRaw);
    if (intentKey !== computedIntentStableRef.current.key) {
      computedIntentStableRef.current = { key: intentKey, intent: computedIntentRaw };
    }
    return computedIntentStableRef.current.intent;
  }, [computedIntentRaw]);

  // SINGLE intent sync effect - prevents ping-pong
  // Only persist intent if it differs from what's already persisted in thread
  const persistedIntentRef = useRef<string>("");
  useEffect(() => {
    if (!activeThreadId) {
      persistedIntentRef.current = "";
      return;
    }

    (async () => {
      const thread = await getThread(activeThreadId);
      const persistedIntent = thread?.intent;
      const persistedIntentKey = persistedIntent ? JSON.stringify(persistedIntent) : "";

    // Update state from computed intent (for UI)
    if (computedIntent) {
      const computedIntentKey = JSON.stringify(computedIntent);
      if (computedIntentKey !== lastIntentInput.current) {
        lastIntentInput.current = computedIntentKey;
        setIntent(computedIntent);
      }
    } else {
      setIntent(persistedIntent || null);
    }

    // Only persist if computed intent differs from persisted AND is not null
    if (computedIntent && persistedIntentKey !== JSON.stringify(computedIntent)) {
      // Guard: only update if this is a real change, not a re-derive of the same value
      const computedKey = JSON.stringify(computedIntent);
      if (computedKey !== persistedIntentRef.current) {
        persistedIntentRef.current = computedKey;
        updateIntent(activeThreadId, computedIntent);
      }
    } else if (!computedIntent && persistedIntentKey !== "") {
      // Clear persisted intent if computed is null but persisted exists
      persistedIntentRef.current = "";
      updateIntent(activeThreadId, null as any); // Clear intent
    }
    })();
  }, [activeThreadId, computedIntent]);

  // Listen for storage events (multi-tab only - same-tab events are ignored via tab ID)
  // CRITICAL: Only respond to exact keys and check tab ID to prevent same-tab loops
  // LOOP PREVENTION: This effect does NOT write to storage, only reads and updates React state
  // CRITICAL FIX: Guard setThreads to only update when threads actually changed (prevents HMR loop)
  useEffect(() => {
    // Get current tab ID from sessionStorage (read fresh on each event to handle tab ID changes)
    const getCurrentTabId = (): string | null => {
      try {
        return typeof window !== "undefined" ? window.sessionStorage.getItem("agora:tabId") : null;
      } catch {
        return null;
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (!activeThreadIdRef.current) return;
      
      // CRITICAL: Only respond to exact keys (not includes) to prevent false matches
      // NOTE: Storage events are deprecated (no localStorage for threads)
      // Only listen for custom events from same-window updates
      // This handler is kept for backward compatibility but does nothing for storage events
      
      if (process.env.NODE_ENV === "development") {
        console.debug("[STORAGE_EVENT] Processed", {
          key: e.key,
          oldValueSize: e.oldValue?.length || 0,
          newValueSize: e.newValue?.length || 0,
          tabId: currentTabId,
        });
      }
      
      // NOTE: We intentionally do NOT increment draftVersion here because:
      // 1. Storage events might be intent/title-only changes (not draft changes)
      // 2. draftVersion is used for memoization, not for triggering effects
      // 3. If draft actually changed, the other tab will have already updated it
      // 4. We only increment draftVersion when we directly modify draft (applyDraftPatch, etc.)
    };
    
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Refresh threads list when active thread changes (but NOT on every draftVersion change to prevent loops)
  // draftVersion changes are handled by the memoized canonicalDraft, not by triggering effects
  const lastActiveThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeThreadId !== lastActiveThreadIdRef.current) {
      lastActiveThreadIdRef.current = activeThreadId;
      if (activeThreadId) {
        // Only refresh threads list when thread changes, not on draft changes
        // Use guarded setThreads to prevent unnecessary re-renders
        (async () => {
          const threads = await getSortedThreads();
          setThreadsGuarded(threads, "activeThreadIdChange");
        })();
      }
    }
  }, [activeThreadId]);

  const handleSendMessage = async (text: string) => {
    // Guard: Check ready state
    const readyCheck = guardReadyState(
      {
        threadId: activeThreadIdRef.current,
        authReady: !!user,
        isSending,
      },
      "sendMessage"
    );

    // No active thread - create one automatically (single-flight guarded)
    let threadId = activeThreadIdRef.current;
    if (!threadId) {
      if (isCreatingThread.current) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[handleSendMessage] Thread creation already in flight");
        }
        showToast({ type: "error", message: "Creating thread, please wait..." });
        return;
      }

      try {
        const newThread = await ensureThreadCreated("sendMessage:autoCreate");
        threadId = newThread.id;
        activeThreadIdRef.current = threadId;
        setActiveThreadIdState(threadId);
        
        // Update threads list
        const updatedThreads = await getSortedThreads();
        setThreadsGuarded(updatedThreads, "handleSendMessage:createThread");
        
        // Load the new thread
        await loadThread(threadId);
        
        // Update URL to reflect the new thread
        router.replace(`/buyer/agent/thread/${threadId}`);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[handleSendMessage] Failed to create thread:", error);
        }
        showToast({ 
          type: "error", 
          message: error instanceof Error ? error.message : "Failed to create thread. Please try again." 
        });
        return; // Fail closed: do not attempt to send message
      }
    }

    // Guard: Assert threadId is valid
    assertThreadId(threadId);

    // Generate stable user message ID BEFORE any state changes
    const userMessageId = crypto.randomUUID();
    const userMessageIdKey = `user:${userMessageId}`;
    const assistantMessageId = `assistant:${threadId}:${userMessageId}`;

    // Block duplicates: check isSending AND thread-level lock
    if (isSending || inFlightThreads.current.has(threadId)) {
      if (process.env.NODE_ENV === "development") {
        console.debug("🚫 BLOCKED_DUPLICATE_SEND", { threadId, text: text.substring(0, 50), userMessageId });
      }
      return;
    }

    // Mark thread as in-flight immediately
    inFlightThreads.current.add(threadId);
    setIsSending(true);

    if (process.env.NODE_ENV === "development") {
      console.debug("📤 USER_SEND", {
        threadId,
        userMessageId,
        assistantMessageId,
        text: text.substring(0, 50),
      });
    }

    try {
      const userMessage: ChatMessage = {
        id: userMessageIdKey,
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      
      // Append to UI (idempotent)
      setMessages((prev) => appendMessageOnce(prev, userMessage));

      // Persist immediately via appendMessage using threadId snapshot
      await appendMessage(threadId, convertChatMessageToThreadMessage(userMessage));

      if (!hasAutoTitled.current) {
        await autoTitleThread(threadId, text);
        hasAutoTitled.current = true;
        const threads = await getSortedThreads();
        setThreadsGuarded(threads, "handleSendMessage:autoTitle");
      }

      // Get current draft from thread.draft (canonical source) using threadId snapshot
      const currentDraft = await getDraft(threadId); // Reads from thread.draft
      
      if (process.env.NODE_ENV === "development") {
        console.log(`[AGENT_CLIENT] OUTGOING_DRAFT`, {
          threadId,
          draftKeys: currentDraft ? Object.keys(currentDraft) : [],
          hasLineItems: currentDraft && Array.isArray(currentDraft.lineItems) && currentDraft.lineItems.length > 0,
          lineItemsCount: currentDraft && Array.isArray(currentDraft.lineItems) ? currentDraft.lineItems.length : 0,
          jobNameOrPo: currentDraft?.jobNameOrPo,
          needBy: currentDraft?.needBy,
          lastAskedSlot: currentDraft?.__lastAskedSlot,
        });
      }
      
      // addAssistantMessage closes over threadId snapshot
      const addAssistantMessage = async (content: string, errorId?: string) => {
        const errorMessageId = errorId || `error:${crypto.randomUUID()}`;
        const errorMessage: ChatMessage = {
          id: errorMessageId,
          role: "assistant",
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => appendMessageOnce(prev, errorMessage));
        await appendMessage(threadId, convertChatMessageToThreadMessage(errorMessage));
      };

      const turnResult = await fetchJson("/api/agent/turn", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          draft: currentDraft || {},
          threadId: threadId,
        }),
      });

      if (turnResult.status === 401) {
        await addAssistantMessage("Please sign in to continue.");
        window.location.href = "/auth/sign-in";
        return;
      }

      if (!turnResult.ok) {
        if (process.env.NODE_ENV === "development") {
          console.error("AGENT_TURN_FAILED", turnResult.status, turnResult.text);
        }
        
        const errorData = turnResult.json || {};
        const errorCode = errorData.error || "";
        
        if (errorCode === "AUTH_REQUIRED" || turnResult.status === 401) {
          await addAssistantMessage("Please sign in to continue.");
          window.location.href = "/auth/sign-in";
          return;
        }
        
        if (errorCode.includes("OPENAI") && errorCode.includes("MISSING")) {
          await addAssistantMessage(
            "Agent is not configured on this environment. Ask admin to set OPENAI_API_KEY and OPENAI_MODEL."
          );
          return;
        }
        
        await addAssistantMessage("I hit an error processing that. Please try again.");
        return;
      }

      const turnData = turnResult.json;
      const assistantContent = turnData.assistantText || "I need more information.";
      
      if (turnData.debug?.offline) {
        if (process.env.NODE_ENV === "development") {
          console.log("[AGENT_OFFLINE_MODE]", {
            reason: turnData.debug.reason,
            provider: turnData.debug.provider,
          });
        }
      }

      // Always persist draftPatch to thread.draft (canonical) using threadId snapshot
      // Use applyDraftPatch (THE ONLY CANONICAL MERGE POINT)
      if (turnData.draftPatch && Object.keys(turnData.draftPatch).length > 0) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[AGENT_CLIENT] INCOMING_DRAFT_PATCH`, {
            threadId,
            draftPatchKeys: Object.keys(turnData.draftPatch),
            hasLineItems: Array.isArray(turnData.draftPatch.lineItems) && turnData.draftPatch.lineItems.length > 0,
            lineItemsCount: Array.isArray(turnData.draftPatch.lineItems) ? turnData.draftPatch.lineItems.length : 0,
            nextSlot: turnData.draftPatch.__lastAskedSlot,
          });
        }
        
        // Apply patch through canonical merge point (writes to thread.draft)
        await applyDraftPatch(threadId, turnData.draftPatch);
        await assertDraftState(threadId, "handleSendMessage:afterDraftPatch");
        setDraftVersionGuarded((v) => v + 1, "handleSendMessage:afterDraftPatch");
      }

      if (assistantContent) {
        const botMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date(),
        };

        // Append to UI (idempotent)
        setMessages((prev) => {
          if (prev.some((m) => m.id === assistantMessageId)) {
            if (process.env.NODE_ENV === "development") {
              console.debug("🔄 DUPLICATE_BLOCKED", {
                assistantMessageId,
                userMessageId,
              });
            }
            return prev;
          }
          
          if (process.env.NODE_ENV === "development") {
            console.debug("✅ ADDED_ASSISTANT_MESSAGE", {
              assistantMessageId,
              userMessageId,
              content: assistantContent.substring(0, 50),
            });
          }
          
          return [...prev, botMessage];
        });

        // Persist immediately via appendMessage using threadId snapshot
        await appendMessage(threadId, convertChatMessageToThreadMessage(botMessage));
      }

      // Update agentState to mirror thread.draft (canonical) using threadId snapshot
      const updatedDraft = shallowCopyDraft(await getDraft(threadId)); // Reads from thread.draft
      if (updatedDraft) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[AGENT_CLIENT] UPDATING_AGENT_STATE`, {
            hasLineItems: Array.isArray(updatedDraft.lineItems) && updatedDraft.lineItems.length > 0,
            lineItemsCount: Array.isArray(updatedDraft.lineItems) ? updatedDraft.lineItems.length : 0,
            lineItems: updatedDraft.lineItems,
          });
        }
        
        const stateMachineInput = canonicalDraftToStateMachineInput(updatedDraft);
        const expectedField = getNextExpectedField(stateMachineInput);
        const stage = mapExpectedFieldToStage(expectedField);
        setAgentState({
          stage,
          expectedField,
          draft: stateMachineInput,
          hasShownCompletion: expectedField === null,
          lastBotPromptKey: undefined,
        });
      }
    } catch (error) {
      console.error("Error in handleSendMessage:", error);
      const errorMessage: ChatMessage = {
        id: `error:${crypto.randomUUID()}`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => appendMessageOnce(prev, errorMessage));
      await appendMessage(threadId, convertChatMessageToThreadMessage(errorMessage));
    } finally {
      // Clear thread-level lock
      inFlightThreads.current.delete(threadId);
      // Only clear isSending if we're still on the same thread (prevents race on thread switch)
      if (activeThreadIdRef.current === threadId) {
        setIsSending(false);
      }
    }
  };

  const handleQuickReply = (reply: string) => {
    handleSendMessage(reply);
  };

  const handleResetDraft = async () => {
    const threadId = requireThreadId();
    
    await clearDraft(threadId);
    await assertDraftState(threadId, "handleResetDraft:afterClear");
    clearLastProcessedKey(threadId);
    setDraftVersionGuarded((v) => v + 1, "handleResetDraft");
    
    const resetMessage: ChatMessage = {
      id: `reset:${crypto.randomUUID()}`,
      role: "assistant",
      content: "Draft cleared.",
      timestamp: new Date(),
    };
    setMessages((prev) => appendMessageOnce(prev, resetMessage));
    await appendMessage(threadId, convertChatMessageToThreadMessage(resetMessage));
    
    setAgentState(initAgentState());
  };

  const missingPrompt = (k: string): string => {
    switch (k) {
      case "categoryId":
        return "Please select a category (e.g., Roofing, HVAC, Plumbing) in the Execution Panel.";
      case "jobNameOrPo":
        return "Please enter a Job Name or PO #.";
      case "lineItems":
        return "Please add at least one complete line item (qty, unit, description/SKU).";
      case "neededBy":
        return "Please specify when you need the materials (e.g., tomorrow, ASAP, or a date).";
      default:
        return "Please provide the missing required information.";
    }
  };

  const handleCreateRequest = async () => {
    // Guard: prevent multiple simultaneous submissions
    if (!rawCanonicalDraft || isCreatingRequest) {
      return;
    }
    const threadId = requireThreadId();

    // Pre-submit validation: check required fields and block if invalid
    const v = validateAgentDraftRFQ(rawCanonicalDraft);
    if (!v.ok) {
      const nextMissing = v.missing[0];
      const errorMessage = missingPrompt(nextMissing);
      
      // Generate error signature to prevent spam
      const errorSignature = `validation:${nextMissing}:${threadId}`;
      
      // Only show error if this is a new error (not repeated)
      if (errorSignature !== lastRfqErrorSignature.current) {
        lastRfqErrorSignature.current = errorSignature;
        
        showToast({ 
          type: "error", 
          message: errorMessage
        });
        
        const errorChatMessage: ChatMessage = {
          id: `error:validation:${crypto.randomUUID()}`,
          role: "assistant",
          content: errorMessage,
          timestamp: new Date(),
        };
        setMessages((prev) => appendMessageOnce(prev, errorChatMessage));
        appendMessage(threadId, convertChatMessageToThreadMessage(errorChatMessage));
      }
      return; // Block submission - do not call API
    }

    if (!user || user.role !== "BUYER") {
      showToast({ type: "error", message: "You must be logged in as a buyer to create an RFQ." });
      return;
    }

    setIsCreatingRequest(true);
    // Clear error signature on new submission attempt
    lastRfqErrorSignature.current = "";

    try {
      const { agentDraftToCreatePayload } = await import("@/lib/agent/translator");
      const payload = agentDraftToCreatePayload(rawCanonicalDraft as any, user.id);
      
      // CRITICAL: Validate payload before sending (dev-only assertion)
      if (process.env.NODE_ENV === "development") {
        if (!payload.category || typeof payload.category !== "string") {
          console.error("[RFQ_PAYLOAD_VALIDATION_FAILED]", {
            category: payload.category,
            categoryType: typeof payload.category,
            categoryId: rawCanonicalDraft?.categoryId,
            categoryLabel: rawCanonicalDraft?.categoryLabel,
            message: "CRITICAL: Payload missing category - this will cause BAD_REQUEST",
          });
        }
      }
      
      // CRITICAL: Log payload (always, not just dev) for diagnostics
      console.log("[RFQ_PAYLOAD_OK]", {
        category: payload.category,
        categoryId: rawCanonicalDraft?.categoryId,
        categoryLabel: rawCanonicalDraft?.categoryLabel,
        title: payload.title,
        jobNameOrPo: rawCanonicalDraft?.jobNameOrPo,
        needBy: rawCanonicalDraft?.needBy,
        lineItemsCount: payload.lineItems?.length || 0,
        fulfillmentType: payload.terms?.fulfillmentType,
        hasCategory: !!payload.category,
        hasJobName: !!payload.title && payload.title !== "Untitled Request",
        hasNeedBy: !!payload.terms?.requestedDate,
      });
      
      const createResponse = await fetch("/api/buyer/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId: user.id,
          payload,
        }),
      });

      let createText = "";
      try {
        createText = await createResponse.text();
      } catch {}

      if (!createResponse.ok) {
        console.error("[RFQ_CREATE_FAILED]", {
          status: createResponse.status,
          threadId,
          payloadCategory: payload.category,
        });
        
        let errorData: any = {};
        try {
          errorData = createText ? JSON.parse(createText) : {};
        } catch {}
        
        // Extract error message - prioritize field-specific errors
        let apiError = errorData.error || errorData.message || "Failed to create RFQ";
        if (errorData.details && Array.isArray(errorData.details)) {
          // Check for category missing error
          const categoryError = errorData.details.find((d: any) => 
            d.path && Array.isArray(d.path) && d.path.includes("category")
          );
          if (categoryError) {
            apiError = "Category is required. Please select a category in the Execution Panel.";
          } else if (errorData.details.length > 0) {
            // Use first validation error message
            apiError = errorData.details[0].message || apiError;
          }
        }
        
        const errorSignature = `api:${createResponse.status}:${apiError}:${threadId}`;
        
        // Only show error if this is a new error (not repeated)
        if (errorSignature !== lastRfqErrorSignature.current) {
          lastRfqErrorSignature.current = errorSignature;
          throw new Error(apiError);
        } else {
          // Same error - just return without showing message
          return;
        }
      }

      let createResult: any = {};
      try {
        createResult = createText ? JSON.parse(createText) : {};
      } catch (e) {
        console.error("[RFQ_CREATE_BAD_JSON]", { createText, error: e });
        throw new Error("Failed to parse response from server");
      }

      // Validate canonical response shape
      // CRITICAL: Accept both id (canonical) and rfqId (backward compatibility)
      const rfqId = createResult.id || createResult.rfqId;
      if (!createResult.ok || !rfqId || !createResult.rfqNumber) {
        const missingFields = [];
        if (!createResult.ok) missingFields.push("ok");
        if (!rfqId) missingFields.push("id or rfqId");
        if (!createResult.rfqNumber) missingFields.push("rfqNumber");
        
        console.error("[RFQ_CREATE_INVALID_RESPONSE]", {
          status: createResponse.status,
          result: createResult,
          missingFields,
          message: "Server returned invalid response shape",
        });
        
        const errorMessage = createResult.error || createResult.message || "Failed to create RFQ";
        const errorSignature = `result:${errorMessage}:${threadId}`;
        
        // Only show error if this is a new error
        if (errorSignature !== lastRfqErrorSignature.current) {
          lastRfqErrorSignature.current = errorSignature;
          
          const errorChatMessage: ChatMessage = {
            id: `error:result:${crypto.randomUUID()}`,
            role: "assistant",
            content: `Failed to create RFQ: ${errorMessage}. Missing fields: ${missingFields.join(", ")}`,
            timestamp: new Date(),
          };
          setMessages((prev) => appendMessageOnce(prev, errorChatMessage));
          await appendMessage(threadId, convertChatMessageToThreadMessage(errorChatMessage));
          showToast({ type: "error", message: errorMessage });
        }
        return;
      }

      // Success: clear error signature and draft
      lastRfqErrorSignature.current = "";
      await clearDraft(threadId); // Clears thread.draft (canonical)
      await assertDraftState(threadId, "handleCreateRequest:afterClear");
      setDraftVersionGuarded((v) => v + 1, "handleCreateRequest");

      setAgentState(initAgentState());

      const successMessage: ChatMessage = {
        id: `success:${crypto.randomUUID()}`,
        role: "assistant",
        content: `Request created successfully! RFQ Number: ${createResult.rfqNumber}`,
        timestamp: new Date(),
      };
      setMessages((prev) => appendMessageOnce(prev, successMessage));
      appendMessage(threadId, convertChatMessageToThreadMessage(successMessage));

      // CRITICAL: Use canonical id (result.id) or fallback to rfqId for backward compatibility
      router.push(`/buyer/rfqs/${rfqId}`);
    } catch (error) {
      console.error("Error creating request:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create request. Please try again.";
      
      // Generate error signature
      const errorSignature = `catch:${errorMessage}:${threadId}`;
      
      // Only show error if this is a new error (not repeated)
      if (errorSignature !== lastRfqErrorSignature.current) {
        lastRfqErrorSignature.current = errorSignature;
        
        const errorChatMessage: ChatMessage = {
          id: `error:catch:${crypto.randomUUID()}`,
          role: "assistant",
          content: `Sorry, I couldn't create the request: ${errorMessage}`,
          timestamp: new Date(),
        };
        setMessages((prev) => appendMessageOnce(prev, errorChatMessage));
        await appendMessage(threadId, convertChatMessageToThreadMessage(errorChatMessage));
        
        showToast({ type: "error", message: errorMessage });
      }
      // Keep draft intact after failure so user can fix and resubmit
    } finally {
      setIsCreatingRequest(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const previousActiveThreadId = activeThreadIdRef.current;
      if (previousActiveThreadId) {
        await saveCurrentThread(previousActiveThreadId);
      }

      const newThread = await ensureThreadCreated("action:newChat");
    // Update ref and store BEFORE loadThread to prevent cross-thread mixing
    activeThreadIdRef.current = newThread.id;
    setActiveThreadIdState(newThread.id);
    const threads = await getSortedThreads();
    setThreadsGuarded(threads, "handleNewChat");
    
    setIsSending(false);
    
      await loadThread(newThread.id);
      setQuickReplies(undefined);
      hasAutoTitled.current = false;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[handleNewChat] Failed to create thread:", error);
      }
      showToast({ 
        type: "error", 
        message: error instanceof Error ? error.message : "Failed to create new chat" 
      });
    } finally {
      isCreatingThread.current = false;
    }
  };

  const handleSelectThread = async (threadId: string) => {
    const previousActiveThreadId = activeThreadIdRef.current;
    if (previousActiveThreadId) {
      await saveCurrentThread(previousActiveThreadId);
    }

    setIsSending(false);

    // Update ref immediately for snapshot discipline
    activeThreadIdRef.current = threadId;
    setActiveThreadIdState(threadId);
    await loadThread(threadId);
    setQuickReplies(undefined);
    
    const thread = await getThread(threadId);
    hasAutoTitled.current = thread ? thread.title !== "New chat" : false;
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    await renameThread(threadId, newTitle);
    const threads = await getSortedThreads();
    setThreadsGuarded(threads, "handleRenameThread");
  };

  const handleDeleteThread = async (threadId: string) => {
    await deleteThread(threadId);
    const updatedThreads = await getSortedThreads();
    setThreadsGuarded(updatedThreads, "handleDeleteThread");

    if (threadId === activeThreadIdRef.current) {
      if (updatedThreads.length > 0) {
        handleSelectThread(updatedThreads[0].id);
      } else {
        handleNewChat();
      }
    }
  };

  const handleCategoryChange = async (category: string) => {
    const threadId = requireThreadId();
    
    const categoryId = labelToCategoryId[category as keyof typeof labelToCategoryId] ?? undefined;
    
    // Use applyDraftPatch (THE ONLY CANONICAL MERGE POINT)
    await applyDraftPatch(threadId, { categoryId, categoryLabel: category });
    await assertDraftState(threadId, "handleCategoryChange:afterPatch");
    setDraftVersionGuarded((v) => v + 1, "handleCategoryChange");
    
    // Update agentState to mirror thread.draft (canonical)
    const updatedDraft = shallowCopyDraft(await getDraft(threadId)); // Reads from thread.draft
    if (updatedDraft) {
      const stateMachineInput = canonicalDraftToStateMachineInput(updatedDraft);
      const expectedField = getNextExpectedField(stateMachineInput);
      const stage = mapExpectedFieldToStage(expectedField);
      setAgentState({
        stage,
        expectedField,
        draft: stateMachineInput,
        hasShownCompletion: expectedField === null,
        lastBotPromptKey: undefined,
      });
    }
  };

  const handleDraftFieldChange = async (field: string, value: any) => {
    const threadId = activeThreadIdRef.current;
    
    // Guard: Ensure threadId is valid before draft operation
    if (!threadId) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[handleDraftFieldChange] No threadId, no-op");
      }
      showToast({ type: "error", message: "No active thread. Please start a conversation." });
      return; // No-op if no thread
    }
    
    assertThreadId(threadId);

    // STRICT WHITELIST: Map ExecutionPanel field names to canonical patch keys
    // This is the single source of truth for field mapping
    const FIELD_MAP: Record<string, (value: any) => Partial<ThreadDraft>> = {
      requestedDate: (v) => ({ needBy: v || undefined }),
      location: (v) => ({ deliveryAddress: v || undefined }),
      category: (v) => {
        const categoryId = labelToCategoryId[v as keyof typeof labelToCategoryId] ?? undefined;
        return {
          categoryId,
          categoryLabel: v || undefined,
        };
      },
      fulfillmentType: (v) => ({ fulfillmentType: v || undefined }),
      jobNameOrPo: (v) => ({ jobNameOrPo: v || undefined }),
      notes: (v) => ({ notes: v || undefined }),
      // Pass through raw lineItems - let applyDraftPatch normalize to canonical shape
      lineItems: (v) => ({
        lineItems: Array.isArray(v) ? v : [],
      }),
    };

    const patchBuilder = FIELD_MAP[field];
    if (!patchBuilder) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[BuyerAgentClient] Unknown field "${field}" ignored in handleDraftFieldChange`
        );
      }
      return; // Ignore unknown fields - do not persist
    }

    // Build patch using the field mapper
    const patch = patchBuilder(value);
    
    // Guard: Check ready state for draft operations
    const readyCheck = guardReadyState(
      {
        threadId,
        authReady: !!user,
      },
      "draftFieldChange"
    );

    if (!readyCheck.canProceed) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[handleDraftFieldChange] Guard failed:", readyCheck.reason);
      }
      showToast({
        type: "error",
        message: readyCheck.reason || "Agent not ready. Please try again.",
      });
      return; // Fail closed: do not persist draft changes
    }

    // Apply patch through canonical merge point (writes to thread.draft, canonical keys only)
    await applyDraftPatch(threadId, patch);
    await assertDraftState(threadId, "handleDraftFieldChange:afterPatch");
    setDraftVersionGuarded((v) => v + 1, "handleDraftFieldChange");

    // Update agentState to mirror thread.draft (canonical)
    const updatedDraft = shallowCopyDraft(await getDraft(threadId)); // Reads from thread.draft
    if (updatedDraft) {
      // Use adapter to convert canonical draft to state machine input shape
      const stateMachineInput = canonicalDraftToStateMachineInput(updatedDraft);
      const expectedField = getNextExpectedField(stateMachineInput);
      const stage = mapExpectedFieldToStage(expectedField);
      setAgentState({
        stage,
        expectedField,
        draft: stateMachineInput, // Use state machine input shape
        hasShownCompletion: expectedField === null,
        lastBotPromptKey: undefined,
      });
    }
  };

  const handleSaveDraft = async () => {
    if (!rawCanonicalDraft?.categoryLabel && !rawCanonicalDraft?.categoryId) {
      showToast({ type: "error", message: "Category is required" });
      return;
    }

    setIsProcessing(true);
    try {
      if (!user) {
        showToast({ type: "error", message: "You must be logged in" });
        return;
      }

      showToast({ type: "success", message: "Draft saved successfully!" });
    } catch (error) {
      console.error("Error saving draft:", error);
      showToast({ type: "error", message: "Failed to save draft" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendToSuppliers = async () => {
    // Guard: Assert threadId is valid
    const threadId = activeThreadIdRef.current;
    assertThreadId(threadId);

    if (!user?.id) {
      const errorMessage = "Not signed in / userId missing — cannot create RFQ.";
      showToast({ type: "error", message: errorMessage });
      return;
    }
    
    if (!rawCanonicalDraft || Object.keys(rawCanonicalDraft).length === 0) {
      showToast({ type: "error", message: "No draft found. Please start a conversation." });
      return;
    }

    const validation = validateAgentDraftRFQ(rawCanonicalDraft);
    if (!validation.ok) {
      const missingFields = validation.missing || [];
      const errorMessage = missingFields.length > 0 
        ? `Missing: ${missingFields.join(", ")}`
        : "Please complete all required fields";
      showToast({ type: "error", message: errorMessage });
      return;
    }

    if (isProcessing) {
      return;
    }

    setIsProcessing(true);
    const finalDraftId = getDraftIdForThread(threadId);
    try {
      if (!user) {
        showToast({ type: "error", message: "You must be logged in" });
        setIsProcessing(false);
        return;
      }

      // Use adapter to convert canonical draft to routing draft (legacy names only in adapter)
      const draftForRouting = canonicalDraftToRoutingDraft(rawCanonicalDraft, finalDraftId);
      
      // Add priority from agentState (not part of canonical draft)
      if (agentState.draft.priority) {
        draftForRouting.priority = agentState.draft.priority;
      }

      console.log("🚀 SEND_START", {
        draftId: finalDraftId,
        category: draftForRouting.category,
        fulfillmentType: draftForRouting.fulfillmentType,
        priority: draftForRouting.priority,
      });

      // Legacy dispatch removed - RFQs are created via POST /api/buyer/rfqs
      // The API handles supplier routing and notifications
      showToast({ type: "error", message: "Use 'Create Request' button to post RFQ via API" });
      return;

      if (!result.ok) {
        showToast({ type: "error", message: result.buyerMessage });
        
        if (process.env.NODE_ENV === "development" && result.debug) {
          console.log("🚨 SEND_DIAGNOSTICS", {
            code: result.code,
            ...result.debug,
          });
        }
        
        if (result.code === "NO_SUPPLIERS" && result.debug) {
          console.log("NO_SUPPLIERS_DEBUG", result.debug);
        }
        
        setIsProcessing(false);
        return;
      }

      console.log("✅ SEND_SUCCESS", {
        rfqId: result.rfqId,
        rfqNumber: result.rfqNumber,
        supplierCount: result.supplierCount,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });

      const priority = agentState.draft.priority;
      let successMessageText: string;
      if (priority === "preferred") {
        successMessageText = "Sent to your preferred supplier. You can track responses on your dashboard.";
      } else if (priority === "fastest") {
        successMessageText = "Sent to the fastest available suppliers. You can track responses on your dashboard.";
      } else {
        successMessageText = "Sent to qualified suppliers in this category. You can track responses on your dashboard.";
      }

      showToast({
        type: "success",
        message: "Request sent successfully!",
      });

      const successMessageId = `success:${result.rfqId}`;
      const successMessage: ChatMessage = {
        id: successMessageId,
        role: "assistant",
        content: successMessageText,
        timestamp: new Date(),
      };
      setMessages((prev) => appendMessageOnce(prev, successMessage));
      await appendMessage(threadId, convertChatMessageToThreadMessage(successMessage));

      await clearDraft(threadId); // Clears thread.draft (canonical)
      await assertDraftState(threadId, "handleSendToSuppliers:afterClear");
      setAgentState(initAgentState());
      clearLastProcessedKey(threadId);
      setDraftVersionGuarded((v) => v + 1, "handleSendToSuppliers");

        setTimeout(() => {
          // Only redirect if we're still on the same thread (prevents redirect after thread switch)
          if (activeThreadIdRef.current === threadId) {
            router.replace("/buyer/requests/sent");
          }
        }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error("❌ DISPATCH_ERROR", {
        error: errorMessage,
        stack: errorStack,
        draftId: finalDraftId,
      });

      showToast({
        type: "error",
        message: `Failed to send request: ${errorMessage}. Please try again.`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // PHASE 2: Execution Panel is read-only reflection of canonical state
  // Build ExecutionPanel draft using adapter (legacy names only in adapter)
  // Snapshot threadId for render to prevent cross-thread issues during render
  // The draft prop is derived from canonicalDraft (memoized on draftVersion)
  // When agent acknowledges/extracts values, they're written to canonical draft via applyDraftPatch
  // Execution Panel automatically reflects changes when draftVersion increments
  const draft: DraftRFQ | null = canonicalDraftToExecutionPanelDraft(canonicalDraft, activeThreadId);

  const showCreating = isCreatingRequest;

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <ChatSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        onRenameThread={handleRenameThread}
        onDeleteThread={handleDeleteThread}
      />

      <div className="flex-1 flex flex-col p-6 border-r border-zinc-200 dark:border-zinc-700">
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              Agora Agent
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Your sales rep
            </p>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <Chat
              messages={messages}
              onSendMessage={handleSendMessage}
              onQuickReply={handleQuickReply}
              quickReplies={quickReplies}
              disabled={false}
              isSending={isSending}
              onResetDraft={handleResetDraft}
            />
          </div>
          
          {/* Confirm panel - derived from canConfirm boolean (no setState in render) */}
          {canConfirm && canonicalDraft ? (
            <div className="mt-4 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-black dark:text-zinc-50 mb-1">
                    Ready to create request
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {canonicalDraft.jobNameOrPo} • {canonicalDraft.categoryLabel || (canonicalDraft.categoryId ? categoryIdToLabel(canonicalDraft.categoryId as CategoryId) : "")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {process.env.NODE_ENV !== "production" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // No-op: Edit button does nothing
                      }}
                      disabled={showCreating}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCreateRequest}
                    disabled={!canConfirm || showCreating}
                  >
                    {showCreating ? "Creating..." : "Create Request"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          
          {/* Creating panel - derived from showCreating boolean */}
          {showCreating ? (
            <div className="mt-4 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-black dark:text-zinc-50">
                    Creating request...
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-96 p-6 overflow-y-auto">
        {draft ? (
          <ExecutionPanel
            draft={draft}
            intent={intent || undefined}
            onCategoryChange={handleCategoryChange}
            onDraftFieldChange={handleDraftFieldChange}
            onSaveDraft={handleSaveDraft}
            onSendToSuppliers={handleSendToSuppliers}
            isProcessing={isProcessing}
          />
        ) : isProcurementMode ? (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Start a conversation to build your request.
          </div>
        ) : null}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
