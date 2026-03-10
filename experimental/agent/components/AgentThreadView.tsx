"use client";

/**
 * Agent Thread View - Main Conversation Interface
 * 
 * This component handles a single thread's conversation.
 * It follows all canonical draft invariants.
 * 
 * INVARIANTS:
 * - thread.draft is the ONLY canonical draft source
 * - ALL draft reads: use getDraft(threadId)
 * - ALL draft writes: use applyDraftPatch(threadId, patch) or clearDraft(threadId)
 * - Messages persisted ONLY via appendMessage(threadId, msg)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getThread,
  appendMessage,
  getDraft,
  applyDraftPatch,
  clearDraft,
  updateIntent,
  autoTitleThread,
  type AgentThread,
} from "@/lib/agentThreads";
import type { IntentAssessment } from "@/lib/types";
import { deriveIntent } from "@/lib/intent-engine";
import { useToast, ToastContainer } from "@/components/Toast";
import Chat, { type ChatMessage } from "@/components/agent/Chat";
import ExecutionPanel from "@/components/agent/ExecutionPanel";
import Button from "@/components/ui2/Button";
import { validateAgentDraftRFQ } from "@/lib/agent/contracts";
import { labelToCategoryId, categoryIdToLabel, type CategoryId } from "@/lib/categoryIds";
import { fetchJson } from "@/lib/clientFetch";
import type { DraftRFQ } from "@/lib/agent/draftBuilder";
import {
  canonicalDraftToExecutionPanelDraft,
} from "@/lib/agent/adapters/draftAdapters";

function convertThreadMessagesToChatMessages(threadMessages: any[]): ChatMessage[] {
  return threadMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
  }));
}

function shallowCopyDraft(draft: any): any {
  if (!draft) return null;
  return { ...draft };
}

function hasProcurementSignal(draft: any): boolean {
  return !!(
    draft.categoryLabel ||
    draft.categoryId ||
    draft.fulfillmentType ||
    draft.needBy ||
    draft.deliveryAddress ||
    (Array.isArray(draft.lineItems) && draft.lineItems.length > 0) ||
    (typeof draft.notes === "string" && draft.notes.trim().length > 0)
  );
}

/**
 * Normalize message for stable hashing: trim, lowercase, collapse whitespace
 */
function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Generate stable clientTurnId based on threadId + normalized message
 * Uses SHA-256 hash and base64url encoding
 */
async function generateClientTurnId(threadId: string, message: string): Promise<string> {
  const normalized = normalizeMessage(message);
  const input = `${threadId}:${normalized}`;
  
  // Hash using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  
  // Convert to base64url
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  
  return `turn:${threadId}:${base64url}`;
}

interface AgentThreadViewProps {
  threadId: string;
}

export default function AgentThreadView({ threadId }: AgentThreadViewProps) {
  const router = useRouter();
  const { showToast, toasts, removeToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [intent, setIntent] = useState<IntentAssessment | null>(null);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const inFlightRef = useRef(false);

  // Helper: require thread ID
  const requireThreadId = (): string => {
    if (!threadId) {
      showToast({ type: "error", message: "No thread selected" });
      throw new Error("No thread selected");
    }
    return threadId;
  };

  // Get thread (async, use state)
  const [thread, setThread] = useState<AgentThread | null>(null);
  const [canonicalDraft, setCanonicalDraft] = useState<any>(null);
  const [rawCanonicalDraft, setRawCanonicalDraft] = useState<any>(null);

  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setCanonicalDraft(null);
      setRawCanonicalDraft(null);
      return;
    }
    (async () => {
      const t = await getThread(threadId);
      setThread(t);
      if (t) {
        const draft = await getDraft(threadId);
        setCanonicalDraft(shallowCopyDraft(draft));
        setRawCanonicalDraft(draft);
      }
    })();
  }, [threadId, draftVersion]);

  // Derive procurement mode (authoritative: thread.state.mode; fallback: signals in draft)
  const isProcurementMode = (thread?.state?.mode === "PROCUREMENT") ||
    (rawCanonicalDraft !== null && hasProcurementSignal(rawCanonicalDraft));

  // Derive validation
  const validation = rawCanonicalDraft ? validateAgentDraftRFQ(rawCanonicalDraft) : { ok: false, missing: ["draft"] };

  // Derive canConfirm
  const canConfirm = isProcurementMode && rawCanonicalDraft !== null && validation.ok;

  // Load thread on mount or threadId change
  useEffect(() => {
    if (!threadId) return;

    (async () => {
      const t = await getThread(threadId);
      if (!t) {
        router.push("/buyer/agent");
        return;
      }

      // Load messages
      const chatMessages = convertThreadMessagesToChatMessages(t.messages);
    
    if (chatMessages.length === 0) {
      const greeting: ChatMessage = {
        id: "greeting",
        role: "assistant",
        content: "I'm Agora, your sales rep. I help you think through the job, make sure nothing's missed, and line up materials and pricing when you're ready. What are you working on?",
        timestamp: new Date(),
      };
      setMessages([greeting]);
    } else {
      setMessages(chatMessages);
    }

      setIntent(t.intent || null);
      setDraftVersion((v) => v + 1);
    })();
  }, [threadId, router]);

  // Handle sending message
  const handleSendMessage = async (text: string) => {
    if (isSending || inFlightRef.current || !text.trim()) return;

    const tid = requireThreadId();
    inFlightRef.current = true;
    setIsSending(true);

    try {
      // Get current draft for API
      const currentDraft = (await getDraft(tid)) || {};

      // Generate stable clientTurnId for idempotency
      const clientTurnId = await generateClientTurnId(tid, text.trim());

      // Generate userMessageId for API (required by schema) and deterministic assistant message ID
      const userMessageId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Call agent turn API
      const result = await fetchJson("/api/agent/turn", {
        method: "POST",
        body: JSON.stringify({
          message: text.trim(),
          draft: currentDraft,
          threadId: tid,
          userMessageId,
          clientTurnId,
        }),
      });

      if (!result.ok || !result.json) {
        throw new Error(result.json?.message || "Agent request failed");
      }

      const { assistantText, draftPatch, mode } = result.json;

      // Apply draft patch if provided
      if (draftPatch && typeof draftPatch === "object") {
        await applyDraftPatch(tid, draftPatch);
        setDraftVersion((v) => v + 1);
      }

      // Append assistant message with deterministic id: assistant:${threadId}:${userMessageId}
      const assistantId = `assistant:${tid}:${userMessageId}`;
      const assistantMessage = {
        id: assistantId,
        role: "assistant" as const,
        content: assistantText || "I'm here to help. What can I assist you with?",
        timestamp: Date.now(),
        inReplyTo: userMessageId, // Link assistant message to user message
        clientTurnId, // Preserve clientTurnId on assistant messages for idempotency
      };

      await appendMessage(tid, assistantMessage);
      setMessages((prev) => {
        // Idempotent: don't append if assistant message with same id already exists
        if (prev.some(m => m.id === assistantId)) {
          return prev;
        }
        return [...prev, {
          id: assistantMessage.id,
          role: "assistant",
          content: assistantMessage.content,
          timestamp: new Date(assistantMessage.timestamp),
        }];
      });

      // Auto-title thread if needed
      if (mode === "procurement" && rawCanonicalDraft) {
        await autoTitleThread(tid, text.trim());
        window.dispatchEvent(new Event("agora:threads:updated"));
      }

    } catch (error: any) {
      console.error("[AgentThreadView] Send error:", error);
      showToast({
        type: "error",
        message: error?.message || "Failed to send message",
      });
    } finally {
      setIsSending(false);
      inFlightRef.current = false;
    }
  };

  // Handle draft field changes
  const handleDraftFieldChange = async (field: string, value: any) => {
    const tid = requireThreadId();
    await applyDraftPatch(tid, { [field]: value });
    setDraftVersion((v) => v + 1);
  };

  // Handle category change
  const handleCategoryChange = async (categoryLabel: string) => {
    const tid = requireThreadId();
    const categoryId = labelToCategoryId[categoryLabel as keyof typeof labelToCategoryId];
    await applyDraftPatch(tid, {
      categoryLabel,
      categoryId,
    });
    setDraftVersion((v) => v + 1);
  };

  // Handle create request
  const handleCreateRequest = async () => {
    if (!canConfirm || isCreatingRequest) return;

    const tid = requireThreadId();
    const draft = await getDraft(tid);
    if (!draft) return;

    setIsCreatingRequest(true);

    try {
      const result = await fetchJson("/api/buyer/rfqs", {
        method: "POST",
        body: JSON.stringify({
          draft,
          threadId: tid,
        }),
      });

      if (!result.ok || !result.json) {
        throw new Error(result.json?.message || "Failed to create request");
      }

      // Clear draft after successful creation
      await clearDraft(tid);
      setDraftVersion((v) => v + 1);

      showToast({
        type: "success",
        message: "Request created successfully",
      });

      // Navigate to the new RFQ
      if (result.json.rfqId) {
        router.push(`/buyer/rfqs/${result.json.rfqId}`);
      }
    } catch (error: any) {
      console.error("[AgentThreadView] Create request error:", error);
      showToast({
        type: "error",
        message: error?.message || "Failed to create request",
      });
    } finally {
      setIsCreatingRequest(false);
    }
  };

  // Build ExecutionPanel draft
  const draft: DraftRFQ | null = canonicalDraftToExecutionPanelDraft(canonicalDraft, threadId);

  return (
    <div className="flex flex-1 h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Agora Agent
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your digital sales rep
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation Pane */}
        <div className="flex-1 flex flex-col p-6">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <Chat
                messages={messages}
                onSendMessage={handleSendMessage}
                disabled={false}
                isSending={isSending}
              />
            </div>

            {/* Confirm panel */}
            {canConfirm && canonicalDraft ? (
              <div className="mt-4 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-black dark:text-zinc-50 mb-1">
                      Ready to create request
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {canonicalDraft.jobNameOrPo} • {canonicalDraft.categoryLabel || (canonicalDraft.categoryId ? categoryIdToLabel[canonicalDraft.categoryId as CategoryId] ?? "" : "")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleCreateRequest}
                      disabled={!canConfirm || isCreatingRequest}
                    >
                      {isCreatingRequest ? "Creating..." : "Create Request"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Execution Panel */}
        {draft && isProcurementMode ? (
          <div className="w-96 border-l border-zinc-200 dark:border-zinc-800 p-6 overflow-y-auto">
            <ExecutionPanel
              draft={draft}
              intent={intent || undefined}
              onCategoryChange={handleCategoryChange}
              onDraftFieldChange={handleDraftFieldChange}
              onSaveDraft={() => {
                // Draft is already saved via applyDraftPatch
                showToast({ type: "success", message: "Draft saved" });
              }}
              onSendToSuppliers={handleCreateRequest}
              isProcessing={isProcessing}
            />
          </div>
        ) : null}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
