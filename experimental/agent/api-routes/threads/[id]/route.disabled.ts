/**
 * ⚠️ FROZEN FOUNDATION — Do not modify without explicit approval
 * 
 * This file implements the core Agent Thread detail API endpoints (GET, PATCH, DELETE).
 * It is a stable platform layer that future features build on top of, not inside.
 * 
 * FROZEN INVARIANTS:
 * - PATCH operations are whitelisted (only allowed ops accepted)
 * - Message idempotency enforced (duplicate IDs return 200 OK)
 * - Draft canonicalization enforced (legacy keys stripped)
 * - Ownership enforced via requireThreadForUser
 * - Error responses use jsonOk/jsonError consistently
 * - Prisma errors never leak to client
 * 
 * Changes to this file require:
 * 1. Design review for any behavior changes
 * 2. Test updates for any logic changes
 * 3. Documentation updates for any API changes
 */

/**
 * Agent Thread Detail API
 * Get and update a specific thread (with ownership check)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { requireThreadForUser } from "@/lib/agent/serverGuards";
import {
  parseThreadState,
  serializeThreadState,
  getDefaultThreadState,
  splitDraftAndState,
  type ThreadState,
} from "@/lib/threadState";
import {
  canonicalizeDraftPatch,
  applyNormalizedPatch,
} from "@/lib/rfqDraftCanonical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agent/threads/[id]
 * Get full thread data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { id } = await params;

    const prisma = getPrisma();
    
    // Use server guard to enforce ownership
    let thread;
    try {
      const result = await requireThreadForUser(prisma, id, user.id);
      // Check if result is a NextResponse (error case)
      if (result instanceof NextResponse) {
        return result;
      }
      thread = result;
    } catch (error: any) {
      // requireThreadForUser throws NextResponse for errors
      if (error instanceof NextResponse) {
        return error;
      }
      // Re-throw other errors to be caught by withErrorHandling
      throw error;
    }
    
    // Fetch timestamps explicitly (requireThreadForUser doesn't include them in return type)
    const threadWithTimestamps = await prisma.agentThread.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        messages: true,
        draft: true,
        meta: true,
        state: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (!threadWithTimestamps) {
      return jsonError("NOT_FOUND", "Thread not found", 404);
    }
    
    thread = threadWithTimestamps;
    
    // Observability: log thread access
    if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
      console.log("[AGENT_THREAD_ACCESSED]", {
        threadId: id,
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
    }

    // Parse JSON fields safely
    let messages: any[] = [];
    let draft: any = {};
    let meta: any = null;
    let state: ThreadState = getDefaultThreadState();

    try {
      messages = thread.messages ? JSON.parse(thread.messages) : [];
    } catch {
      messages = [];
    }

    try {
      draft = thread.draft ? JSON.parse(thread.draft) : {};
    } catch {
      draft = {};
    }

    try {
      meta = thread.meta ? JSON.parse(thread.meta) : null;
    } catch {
      meta = null;
    }

    // Parse state
    state = parseThreadState(thread.state);
    if (process.env.NODE_ENV === "development") {
      console.log("[STATE_PARSE] Parsed thread state", {
        threadId: id,
        state,
      });
    }

    return jsonOk(
      {
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
        messages,
        draft,
        meta,
        state,
      },
      200
    );
  });
}

/**
 * PATCH /api/agent/threads/[id]
 * Apply partial updates to a thread
 * Operations: appendMessage, applyDraftPatch, clearDraft, setTitle
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const prisma = getPrisma();

    // Use server guard to enforce ownership
    let existing;
    try {
      const result = await requireThreadForUser(prisma, id, user.id);
      // requireThreadForUser returns thread or throws NextResponse
      existing = result;
    } catch (error: any) {
      // requireThreadForUser throws NextResponse for errors
      if (error instanceof NextResponse) {
        return error;
      }
      // Re-throw other errors to be caught by withErrorHandling
      throw error;
    }
    
    // Fetch timestamps explicitly (requireThreadForUser doesn't include them in return type)
    const existingWithTimestamps = await prisma.agentThread.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        messages: true,
        draft: true,
        meta: true,
        state: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (!existingWithTimestamps) {
      return jsonError("NOT_FOUND", "Thread not found", 404);
    }
    
    existing = existingWithTimestamps;

    // Parse existing JSON fields
    let messages: any[] = [];
    let draft: any = {};
    let meta: any = null;
    let state: ThreadState = getDefaultThreadState();
    let stateModified = false; // Track if state was modified

    try {
      messages = existing.messages ? JSON.parse(existing.messages) : [];
    } catch {
      messages = [];
    }

    try {
      draft = existing.draft ? JSON.parse(existing.draft) : {};
    } catch {
      draft = {};
    }

    try {
      meta = existing.meta ? JSON.parse(existing.meta) : null;
    } catch {
      meta = null;
    }

    // Parse state
    state = parseThreadState(existing.state);

    // ⚠️ FROZEN INVARIANT: PATCH OPERATION WHITELIST
    // Only whitelisted operations are accepted. Unknown operations are rejected.
    // This prevents accidental or malicious operations from bypassing invariants.
    const op = body.op as string;
    const ALLOWED_OPS = ["appendMessage", "applyDraftPatch", "applyStatePatch", "clearDraft", "setTitle", "updateMeta"] as const;
    
    if (!op || typeof op !== "string" || !ALLOWED_OPS.includes(op as any)) {
      // Dev-only: Log INVALID_OPERATION attempts for debugging
      if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
        console.warn("[AGENT_PATCH] INVALID_OPERATION attempt", { 
          op, 
          threadId: id, 
          userId: user.id,
          allowedOps: ALLOWED_OPS,
          timestamp: new Date().toISOString(),
        });
      }
      return jsonError("INVALID_OPERATION", `Unknown operation: ${op}. Allowed: ${ALLOWED_OPS.join(", ")}`, 400);
    }

    // Observability: log operation
    if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
      console.log("[AGENT_THREAD_OPERATION]", {
        threadId: id,
        userId: user.id,
        operation: op,
        timestamp: new Date().toISOString(),
      });
    }

    if (op === "appendMessage") {
      const message = body.message;
      if (!message || !message.id) {
        return jsonError("BAD_REQUEST", "Message must have id", 400);
      }

      // MESSAGE IDEMPOTENCY: Check for duplicate message ID or clientTurnId
      const existingById = messages.find((m: any) => m.id === message.id);
      const existingByClientTurnId = message.clientTurnId 
        ? messages.find((m: any) => m.clientTurnId === message.clientTurnId)
        : null;
      
      if (existingById || existingByClientTurnId) {
        // Idempotent: same message ID or clientTurnId = no-op, return existing thread (200 OK)
        if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
          console.log("[AGENT_MESSAGE_IDEMPOTENT]", {
            threadId: id,
            messageId: message.id,
            clientTurnId: message.clientTurnId,
            duplicateById: !!existingById,
            duplicateByClientTurnId: !!existingByClientTurnId,
            userId: user.id,
          });
        }
        // Parse state for response
        const existingState = parseThreadState(existing.state);
        return jsonOk(
          {
            id: existing.id,
            title: existing.title,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
            messages,
            draft,
            meta,
            state: existingState,
          },
          200
        );
      }

      // Strip clientTurnId from user messages before persisting
      // Only assistant messages should have clientTurnId (for idempotency tracking)
      const messageToStore = { ...message };
      if (messageToStore.role === "user") {
        delete (messageToStore as any).clientTurnId;
      }

      // Append message (idempotency check passed)
      messages = [...messages, messageToStore];
      
      // Observability: log message append
      if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
        console.log("[AGENT_MESSAGE_APPENDED]", {
          threadId: id,
          messageId: message.id,
          role: message.role,
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (op === "applyDraftPatch") {
      const patch = body.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return jsonError("BAD_REQUEST", "Patch must be a plain object", 400);
      }

      // CRITICAL: Strict validation - reject legacy keys with 400 error
      // These keys are permanently banned from all write paths
      const FORBIDDEN_LEGACY_KEYS = [
        "conversationMode",
        "__lastAskedSlot",
        "__resolvedSlots",
        "__lastQuestionAsked",
        "expectedField",
        "pricingSendTo", // Not a real RFQ field - dispatch state is server-controlled only
      ];
      
      // Also reject any key starting with "__" (except documented server-only keys)
      const ALLOWED_UNDERSCORE_KEYS = [
        "__lastUserMessageId", // Idempotency only
        "__lastUserMessageHash", // Idempotency only
      ];
      
      for (const key in patch) {
        // Check forbidden legacy keys
        if (FORBIDDEN_LEGACY_KEYS.includes(key)) {
          return jsonError("BAD_REQUEST", `Legacy key not allowed: ${key}`, 400);
        }
        
        // Check __* keys (except allowed ones)
        if (key.startsWith("__") && !ALLOWED_UNDERSCORE_KEYS.includes(key)) {
          return jsonError("BAD_REQUEST", `Legacy key not allowed: ${key}`, 400);
        }
      }

      // STATE_INPUT_KEYS: Only idempotency keys are accepted
      // Dispatch state (__pricingConfirmed, __pricingDispatched, __requestId, pricingSendTo) is server-controlled only
      // Clients cannot patch dispatch state - only /api/agent/turn can modify state.dispatch
      const STATE_INPUT_KEYS = [
        "__lastUserMessageHash", // Idempotency only
        "__lastUserMessageId", // Idempotency only
      ] as const;

      // Separate state input keys from draft keys
      const stateInputPatch: Record<string, any> = {};
      const draftInputPatch: Record<string, any> = {};
      
      for (const key in patch) {
        if (STATE_INPUT_KEYS.includes(key as any)) {
          stateInputPatch[key] = patch[key];
        } else {
          draftInputPatch[key] = patch[key];
        }
      }

      // DRAFT CANONICALIZATION: Use authoritative canonicalization module
      // Only canonicalize draft keys (state keys are handled separately)
      const normalizedPatch = canonicalizeDraftPatch(draftInputPatch, {
        threadId: id,
        log: process.env.NODE_ENV === "development",
      });

      // Apply normalized patch to draft
      draft = applyNormalizedPatch(draft, normalizedPatch);
      
      // CRITICAL: Split draft and state - migrate any legacy state keys from draft to state
      // Include state input keys in a temporary object for migration
      const { cleanDraft, statePatch } = splitDraftAndState({ ...draft, ...stateInputPatch });
      draft = cleanDraft;
      
      // Merge state patch into existing state if present
      if (statePatch) {
        state = {
          ...state,
          ...(statePatch.mode && { mode: statePatch.mode }),
          ...(statePatch.phase !== undefined && { phase: statePatch.phase }),
          progress: {
            ...state.progress,
            ...statePatch.progress,
          },
          dispatch: {
            ...state.dispatch,
            ...statePatch.dispatch,
          },
        };
        stateModified = true;
        
        if (process.env.NODE_ENV === "development") {
          console.log("[STATE_MIGRATE]", {
            threadId: id,
            movedKeys: Object.keys(statePatch).concat(
              statePatch.progress ? Object.keys(statePatch.progress) : [],
              statePatch.dispatch ? Object.keys(statePatch.dispatch) : []
            ),
          });
        }
      }
      
      // Observability: log draft update
      if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
        console.log("[AGENT_DRAFT_UPDATED]", {
          threadId: id,
          userId: user.id,
          patchKeys: Object.keys(normalizedPatch),
          draftKeys: Object.keys(draft),
          stateMigrated: !!statePatch,
          timestamp: new Date().toISOString(),
        });
        if (statePatch) {
          console.log("[STATE_MIGRATE] Migrated state from draft", {
            threadId: id,
            statePatch,
          });
        }
        console.log("[DRAFT_KEYS] Final draft keys", {
          threadId: id,
          keys: Object.keys(draft),
        });
      }
    } else if (op === "applyStatePatch") {
      const patch = body.patch as Partial<ThreadState>;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return jsonError("BAD_REQUEST", "State patch must be a plain object", 400);
      }

      // Deep merge state patch
      state = {
        ...state,
        ...(patch.mode && { mode: patch.mode }),
        ...(patch.phase !== undefined && { phase: patch.phase }),
        progress: {
          ...state.progress,
          ...patch.progress,
        },
        dispatch: {
          ...state.dispatch,
          ...patch.dispatch,
        },
      };
      stateModified = true;
      
      if (process.env.NODE_ENV === "development") {
        console.log("[STATE_PATCH] Applied state patch", {
          threadId: id,
          userId: user.id,
          patch,
          resultingState: state,
        });
      }
    } else if (op === "clearDraft") {
      draft = {};
      
      // Observability: log draft clear
      if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
        console.log("[AGENT_DRAFT_CLEARED]", {
          threadId: id,
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (op === "setTitle") {
      const title = body.title;
      if (typeof title !== "string") {
        return jsonError("BAD_REQUEST", "Title must be a string", 400);
      }
      // Title will be updated in the Prisma update below
    } else if (op === "updateMeta") {
      const newMeta = body.meta;
      // Update meta field
      meta = newMeta || null;
    }
    // Note: Invalid operations are already rejected by the whitelist check above

    // Prepare update data
    const updateData: any = {
      messages: JSON.stringify(messages),
      draft: JSON.stringify(draft),
      updatedAt: new Date(),
    };

    // Only update state if it was modified
    if (stateModified) {
      updateData.state = serializeThreadState(state);
    }
    // For other ops, leave state undefined to avoid overwriting

    if (op === "setTitle") {
      updateData.title = (body.title as string)?.trim() || "New chat";
    }

    if (op === "updateMeta" || op === "applyDraftPatch" || op === "applyStatePatch" || op === "clearDraft" || op === "appendMessage") {
      updateData.meta = meta !== null ? JSON.stringify(meta) : null;
    }

    // Update thread (Prisma errors caught by withErrorHandling)
    let updated;
    try {
      updated = await prisma.agentThread.update({
        where: { id },
        data: updateData,
      });
    } catch (error: any) {
      // Prisma errors are caught and normalized by withErrorHandling
      // Re-throw to let withErrorHandling handle it
      throw error;
    }

    // Parse updated JSON fields
    let updatedMessages: any[] = [];
    let updatedDraft: any = {};
    let updatedMeta: any = null;
    let updatedState: ThreadState = getDefaultThreadState();

    try {
      updatedMessages = updated.messages ? JSON.parse(updated.messages) : [];
    } catch {
      updatedMessages = [];
    }

    try {
      updatedDraft = updated.draft ? JSON.parse(updated.draft) : {};
    } catch {
      updatedDraft = {};
    }

    try {
      updatedMeta = updated.meta ? JSON.parse(updated.meta) : null;
    } catch {
      updatedMeta = null;
    }

    // Parse updated state
    updatedState = parseThreadState(updated.state);

    return jsonOk(
      {
        id: updated.id,
        title: updated.title,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        messages: updatedMessages,
        draft: updatedDraft,
        meta: updatedMeta,
        state: updatedState,
      },
      200
    );
  });
}

/**
 * DELETE /api/agent/threads/[id]
 * Delete a thread (with ownership check)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const { id } = await params;

    const prisma = getPrisma();

    // Use server guard to enforce ownership before delete
    try {
      await requireThreadForUser(prisma, id, user.id);
      // requireThreadForUser returns thread or throws NextResponse
      // We don't need the thread data, just verify ownership
    } catch (error: any) {
      // requireThreadForUser throws NextResponse for errors
      if (error instanceof NextResponse) {
        return error;
      }
      // Re-throw other errors to be caught by withErrorHandling
      throw error;
    }

    // Delete thread (ownership already verified)
    const deleted = await prisma.agentThread.deleteMany({
      where: {
        id,
        userId: user.id,
      },
    });

    if (deleted.count === 0) {
      // Should not happen after requireThreadForUser, but defensive check
      return jsonError("NOT_FOUND", "Thread not found", 404);
    }

    return jsonOk({ ok: true }, 200);
  });
}

