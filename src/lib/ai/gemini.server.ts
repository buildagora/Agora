/**
 * Server-only Gemini client.
 *
 * Uses @google/genai (the unified GoogleGenAI SDK).
 * Lazy-constructed and cached on globalThis so dev hot-reload doesn't churn
 * connections.
 */

import "server-only";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

const globalForGenAI = globalThis as unknown as {
  __agoraGenAI?: GoogleGenAI;
};

export function getGenAI(): GoogleGenAI {
  if (globalForGenAI.__agoraGenAI) return globalForGenAI.__agoraGenAI;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment");
  }

  const client = new GoogleGenAI({ apiKey });
  globalForGenAI.__agoraGenAI = client;
  return client;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export type ChatTurnMessage = {
  role: "user" | "model";
  text: string;
};

/** Inline binary attached to the current user turn (not persisted). */
export type ChatTurnAttachment = {
  mimeType: string;
  /** Raw bytes; will be base64-encoded for the API. */
  data: Uint8Array;
};

function buildContents(
  history: ChatTurnMessage[],
  attachments: ChatTurnAttachment[] | undefined
) {
  const out = history.map((m, idx) => {
    const isLast = idx === history.length - 1;
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: m.text },
    ];
    if (isLast && attachments && attachments.length > 0) {
      for (const a of attachments) {
        parts.push({
          inlineData: {
            mimeType: a.mimeType,
            data: Buffer.from(a.data).toString("base64"),
          },
        });
      }
    }
    return { role: m.role, parts };
  });
  return out;
}

/**
 * Run one chat turn.
 *
 * `history` is the full conversation including the new user message at the
 * end. Returns the assistant's plain-text reply.
 */
export async function generateChatTurn(args: {
  history: ChatTurnMessage[];
  systemPrompt: string;
  locationHint?: string;
  attachments?: ChatTurnAttachment[];
}): Promise<{ text: string; usage?: { input?: number; output?: number } }> {
  const { history, systemPrompt, locationHint, attachments } = args;

  if (history.length === 0) {
    throw new Error("history must contain at least one message");
  }
  if (history[history.length - 1].role !== "user") {
    throw new Error("last message in history must be from the user");
  }

  const contents = buildContents(history, attachments);

  const systemInstruction = locationHint
    ? `${systemPrompt}\n\nUser's approximate location: ${locationHint}`
    : systemPrompt;

  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents,
    config: { systemInstruction },
  });

  const text = response.text ?? "";
  const usage = response.usageMetadata
    ? {
        input: response.usageMetadata.promptTokenCount,
        output: response.usageMetadata.candidatesTokenCount,
      }
    : undefined;

  return { text, usage };
}

/**
 * Streaming variant. Yields each text delta from Gemini as it arrives, then a
 * final `{ done: true, usage }` payload after the stream completes.
 */
export async function* streamChatTurn(args: {
  history: ChatTurnMessage[];
  systemPrompt: string;
  locationHint?: string;
  attachments?: ChatTurnAttachment[];
}): AsyncGenerator<
  { delta: string } | { done: true; usage?: { input?: number; output?: number } }
> {
  const { history, systemPrompt, locationHint, attachments } = args;

  if (history.length === 0) {
    throw new Error("history must contain at least one message");
  }
  if (history[history.length - 1].role !== "user") {
    throw new Error("last message in history must be from the user");
  }

  const contents = buildContents(history, attachments);

  const systemInstruction = locationHint
    ? `${systemPrompt}\n\nUser's approximate location: ${locationHint}`
    : systemPrompt;

  const ai = getGenAI();
  const stream = await ai.models.generateContentStream({
    model: getGeminiModel(),
    contents,
    config: { systemInstruction },
  });

  let lastUsage: { input?: number; output?: number } | undefined;
  for await (const chunk of stream) {
    if (chunk.usageMetadata) {
      lastUsage = {
        input: chunk.usageMetadata.promptTokenCount,
        output: chunk.usageMetadata.candidatesTokenCount,
      };
    }
    const text = chunk.text;
    if (text) yield { delta: text };
  }
  yield { done: true, usage: lastUsage };
}
