/**
 * ⚠️ FROZEN FOUNDATION — Do not modify without explicit approval
 * 
 * This file implements server-side guards for agent operations.
 * It is a stable platform layer that future features build on top of, not inside.
 * 
 * FROZEN INVARIANTS:
 * - requireThreadForUser() enforces ownership (user can only access own threads)
 * - Distinguishes NOT_FOUND (404) from UNAUTHORIZED (403)
 * - Prisma errors are caught and normalized
 * 
 * Changes to this file require:
 * 1. Design review for any behavior changes
 * 2. Test updates for any logic changes
 * 3. Documentation updates for any API changes
 */

/**
 * Agent Server Guards
 * Server-side guards for agent operations to enforce ownership and existence
 */

import { PrismaClient } from "@prisma/client";
import { jsonError } from "@/lib/apiResponse";

/**
 * Require a thread to exist and belong to the specified user
 * @throws NextResponse (jsonError) if thread not found or unauthorized
 * This throws a NextResponse object, not an Error, so it can be returned directly
 */
export async function requireThreadForUser(
  prisma: PrismaClient,
  threadId: string,
  userId: string
): Promise<{ id: string; userId: string; messages: string; draft: string; meta: string | null; title: string | null }> {
  let thread;
  try {
    thread = await prisma.agentThread.findFirst({
      where: {
        id: threadId,
        userId: userId, // Ownership check
      },
    });
  } catch (error: any) {
    // Prisma errors are caught and normalized by withErrorHandling
    throw error;
  }

  if (!thread) {
    // Distinguish between not found and unauthorized
    let exists = false;
    try {
      const check = await prisma.agentThread.findUnique({
        where: { id: threadId },
        select: { id: true },
      });
      exists = !!check;
    } catch (error: any) {
      // Prisma errors are caught and normalized by withErrorHandling
      throw error;
    }

    if (exists) {
      // Thread exists but belongs to different user
      if (process.env.NODE_ENV === "development") {
        console.warn("[AGENT_SERVER_GUARD] Unauthorized thread access", { threadId, userId });
      }
      // Return NextResponse directly (will be caught and returned by route handler)
      throw jsonError("UNAUTHORIZED", "You do not have access to this thread", 403);
    } else {
      // Thread does not exist
      if (process.env.NODE_ENV === "development") {
        console.warn("[AGENT_SERVER_GUARD] Thread not found", { threadId, userId });
      }
      throw jsonError("NOT_FOUND", "Thread not found", 404);
    }
  }

  return thread;
}
