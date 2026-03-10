/**
 * Agent Conversation State Debug Endpoint
 * Returns the current agent conversation state for debugging
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import { getPrisma } from "@/lib/db.server";
import { createAgentConversationState, serializeState } from "@/lib/agent/AgentConversationState";
import { canonicalizeDraftPatch } from "@/lib/rfqDraftCanonical";
import { computeRfqStatus } from "@/lib/agent/rfqStatus";
import { parseThreadState, getDefaultThreadState, type ThreadState } from "@/lib/threadState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const user = await requireCurrentUserFromRequest(req);
    
    // Get threadId from query
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");
    
    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }
    
    // Load thread
    const prisma = getPrisma();
    const thread = await prisma.agentThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        draft: true,
        userId: true,
        state: true,
      },
    });
    
    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }
    
    // Verify ownership
    if (thread.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    
    // Parse draft
    let draft: Record<string, unknown> = {};
    try {
      draft = thread.draft ? JSON.parse(thread.draft) : {};
    } catch {
      draft = {};
    }
    
    // CRITICAL: Canonicalize draft before computing state
    // This ensures readiness/required-slot evaluation uses canonical keys only
    // Use authoritative canonicalization module
    const canonicalizedDraft = canonicalizeDraftPatch(draft, {
      threadId,
      log: process.env.NODE_ENV === "development",
    });
    
    // Create state from canonicalized draft
    const state = createAgentConversationState(threadId, canonicalizedDraft);
    
    // Parse thread state (for dispatch status)
    let threadState: ThreadState | null = null;
    try {
      threadState = parseThreadState(thread.state);
    } catch {
      // If parsing fails, use default
      threadState = getDefaultThreadState();
    }
    
    // Compute RFQ status using single source of truth
    const rfqStatus = computeRfqStatus({
      draft: canonicalizedDraft,
      threadState: threadState,
    });
    
    // Serialize and return with debug info
    const serialized = serializeState(state);
    return NextResponse.json({
      ...serialized,
      debug: {
        rfqStatus,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

