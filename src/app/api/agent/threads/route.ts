/**
 * ⚠️ FROZEN FOUNDATION — Do not modify without explicit approval
 * 
 * This file implements the core Agent Thread API endpoints (list, create).
 * It is a stable platform layer that future features build on top of, not inside.
 * 
 * FROZEN INVARIANTS:
 * - All routes authenticate and scope by userId
 * - Thread creation is logged for observability
 * - Error responses use jsonOk/jsonError consistently
 * - Prisma errors never leak to client
 * 
 * Changes to this file require:
 * 1. Design review for any behavior changes
 * 2. Test updates for any logic changes
 * 3. Documentation updates for any API changes
 */

/**
 * Agent Threads API
 * List and create agent threads for the authenticated user
 */

import { NextRequest } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { jsonOk, jsonError, withErrorHandling } from "@/lib/apiResponse";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agent/threads
 * List all threads for the current user (minimal fields)
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    const prisma = getPrisma();
    const threads = await prisma.agentThread.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Convert to API format (ISO timestamps)
    const result = threads.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return jsonOk(result, 200);
  });
}

/**
 * POST /api/agent/threads
 * Create a new thread for the current user
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    requireServerEnv();

    let user;
    try {
      user = await requireCurrentUserFromRequest(request);
    } catch {
      return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("BAD_REQUEST", "Invalid JSON", 400);
    }

    const title = (body.title as string)?.trim() || "New chat";

    const prisma = getPrisma();
    
    // Runtime guard: Verify prisma.agentThread exists (Prisma Client matches schema)
    if (!prisma.agentThread) {
      const prismaKeys = Object.keys(prisma).filter(key => !key.startsWith("$") && !key.startsWith("_"));
      console.error("[POST /api/agent/threads] Prisma Client missing agentThread model", {
        prismaKeys,
        availableModels: prismaKeys,
        prismaClientType: typeof prisma,
        prismaConstructor: prisma.constructor?.name,
      });
      
      // Try to access it directly to see what error we get
      try {
        (prisma as any).agentThread;
      } catch (e: any) {
        console.error("[POST /api/agent/threads] Error accessing agentThread:", e.message);
      }
      
      return jsonError(
        "INTERNAL_ERROR",
        `Prisma Client does not include AgentThread model. Available models: ${prismaKeys.join(", ")}. Run 'npx prisma generate' to regenerate the client.`,
        500
      );
    }
    
    const thread = await prisma.agentThread.create({
      data: {
        userId: user.id,
        title,
        messages: "[]",
        draft: "{}",
        meta: null,
      },
    });
    
    // Observability: log thread creation
    if (process.env.NODE_ENV === "development" || process.env.LOG_AGENT_OPS === "true") {
      console.log("[AGENT_THREAD_CREATED]", {
        threadId: thread.id,
        userId: user.id,
        title: thread.title,
        timestamp: new Date().toISOString(),
      });
    }

    // Return full thread (parse JSON fields)
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
      201
    );
  });
}




