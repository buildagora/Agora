/**
 * Chat-thread persistence.
 *
 * Backed by the existing `AgentThread` model — we repurposed it for chat (the
 * legacy experimental agent that originally used it has 0 rows, so no
 * discriminator field is needed yet). Each row stores the full message history
 * as JSON in `messages` to match the column conventions already in the schema.
 *
 * Ownership: a thread belongs to either a logged-in `userId` OR an anonymous
 * cookie ID. Access checks must verify at least one matches.
 */

import "server-only";
import { getPrisma } from "@/lib/db.server";
import type {
  ChatMessage,
  ChatThreadDetail,
  ChatThreadSummary,
} from "./types";

type Owner = { userId?: string | null; anonymousId?: string | null };

function ensureOwner(owner: Owner): void {
  if (!owner.userId && !owner.anonymousId) {
    throw new Error("chat thread requires either userId or anonymousId");
  }
}

function parseMessages(raw: string): ChatMessage[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatMessage =>
        m &&
        (m.role === "user" || m.role === "model") &&
        typeof m.text === "string" &&
        typeof m.createdAt === "string"
    );
  } catch {
    return [];
  }
}

function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  return trimmed.length <= 60 ? trimmed : trimmed.slice(0, 57) + "...";
}

/** Load a thread, enforcing ownership. Returns null if not found OR not owned. */
export async function loadThread(
  threadId: string,
  owner: Owner
): Promise<ChatThreadDetail | null> {
  ensureOwner(owner);
  const prisma = getPrisma();
  const row = await prisma.agentThread.findUnique({ where: { id: threadId } });
  if (!row) return null;

  const ownsByUser = owner.userId && row.userId === owner.userId;
  const ownsByAnon =
    owner.anonymousId && row.anonymousId === owner.anonymousId;
  if (!ownsByUser && !ownsByAnon) return null;

  const messages = parseMessages(row.messages);
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    messageCount: messages.length,
    messages,
  };
}

/** Create a new empty thread owned by the given identity. */
export async function createThread(owner: Owner): Promise<ChatThreadDetail> {
  ensureOwner(owner);
  const prisma = getPrisma();
  const row = await prisma.agentThread.create({
    data: {
      userId: owner.userId ?? null,
      anonymousId: owner.userId ? null : owner.anonymousId ?? null,
      messages: "[]",
    },
  });
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    messageCount: 0,
    messages: [],
  };
}

/**
 * Append both the user message and the assistant reply in a single write.
 * Returns the updated thread.
 */
export async function appendTurn(
  threadId: string,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage,
  owner: Owner
): Promise<ChatThreadDetail> {
  ensureOwner(owner);
  const existing = await loadThread(threadId, owner);
  if (!existing) {
    throw new Error("thread not found or not owned by caller");
  }

  const nextMessages = [...existing.messages, userMessage, assistantMessage];
  const nextTitle =
    existing.title ?? (existing.messages.length === 0 ? deriveTitle(userMessage.text) : null);

  const prisma = getPrisma();
  const row = await prisma.agentThread.update({
    where: { id: threadId },
    data: {
      messages: JSON.stringify(nextMessages),
      title: nextTitle,
    },
  });

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    messageCount: nextMessages.length,
    messages: nextMessages,
  };
}

/** List threads belonging to the caller, newest first. */
export async function listThreads(owner: Owner): Promise<ChatThreadSummary[]> {
  ensureOwner(owner);
  const prisma = getPrisma();

  const where = owner.userId
    ? { userId: owner.userId }
    : { anonymousId: owner.anonymousId ?? undefined, userId: null };

  const rows = await prisma.agentThread.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    messageCount: parseMessages(row.messages).length,
  }));
}

/**
 * Transfer all anonymous threads to a logged-in user (called after sign-in).
 * Returns the number of threads claimed.
 */
export async function claimAnonymousThreads(
  anonymousId: string,
  userId: string
): Promise<number> {
  const prisma = getPrisma();
  const result = await prisma.agentThread.updateMany({
    where: { anonymousId, userId: null },
    data: { userId, anonymousId: null },
  });
  return result.count;
}
