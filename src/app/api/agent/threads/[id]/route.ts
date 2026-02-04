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

    return jsonOk(
      {
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
        messages,
        draft,
        meta,
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

    // Parse existing JSON fields
    let messages: any[] = [];
    let draft: any = {};
    let meta: any = null;

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

    // ⚠️ FROZEN INVARIANT: PATCH OPERATION WHITELIST
    // Only whitelisted operations are accepted. Unknown operations are rejected.
    // This prevents accidental or malicious operations from bypassing invariants.
    const op = body.op as string;
    const ALLOWED_OPS = ["appendMessage", "applyDraftPatch", "clearDraft", "setTitle", "updateMeta"] as const;
    
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

      // MESSAGE IDEMPOTENCY: Check for duplicate message ID
      const existingMessage = messages.find((m: any) => m.id === message.id);
      if (existingMessage) {
        // Idempotent: same message ID = no-op, return existing thread (200 OK)
        if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
          console.log("[AGENT_MESSAGE_IDEMPOTENT]", {
            threadId: id,
            messageId: message.id,
            userId: user.id,
          });
        }
        return jsonOk(
          {
            id: existing.id,
            title: existing.title,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
            messages,
            draft,
            meta,
          },
          200
        );
      }

      // Append message (idempotency check passed)
      messages = [...messages, message];
      
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

      // DRAFT CANONICALIZATION: Only allow canonical keys
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

      // Legacy key mappings (input only - never persisted)
      const LEGACY_KEY_MAP: Record<string, string> = {
        requestedDate: "needBy",
        neededBy: "needBy",
        location: "deliveryAddress",
        address: "deliveryAddress",
        category: "categoryLabel",
        requested_date: "needBy",
        delivery_address: "deliveryAddress",
      };

      // Normalize patch: convert legacy keys to canonical, strip unknown keys
      const normalizedPatch: any = {};
      for (const key in patch) {
        // Map legacy keys to canonical
        const canonicalKey = LEGACY_KEY_MAP[key] || key;
        
        // Only include if it's an allowed canonical key
        if (ALLOWED_DRAFT_KEYS.includes(canonicalKey as any)) {
          normalizedPatch[canonicalKey] = patch[key];
        } else if (process.env.NODE_ENV === "development") {
          console.warn("[AGENT_DRAFT] Stripped unknown key from patch", { key, threadId: id });
        }
      }

      // Merge normalized patch into draft
      draft = { ...draft, ...normalizedPatch };

      // Remove undefined/null/empty string values
      for (const key in draft) {
        if (draft[key] === undefined || draft[key] === null || draft[key] === "") {
          delete draft[key];
        }
      }
      
      // Observability: log draft update
      if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
        console.log("[AGENT_DRAFT_UPDATED]", {
          threadId: id,
          userId: user.id,
          patchKeys: Object.keys(normalizedPatch),
          timestamp: new Date().toISOString(),
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

    if (op === "setTitle") {
      updateData.title = (body.title as string)?.trim() || "New chat";
    }

    if (op === "updateMeta" || op === "applyDraftPatch" || op === "clearDraft" || op === "appendMessage") {
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

    return jsonOk(
      {
        id: updated.id,
        title: updated.title,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        messages: updatedMessages,
        draft: updatedDraft,
        meta: updatedMeta,
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
      const result = await requireThreadForUser(prisma, id, user.id);
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

