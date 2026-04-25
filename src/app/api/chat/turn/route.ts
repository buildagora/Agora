/**
 * POST /api/chat/turn
 *
 * Step 5: file uploads.
 *
 * - JSON body (no files): { threadId?, message, locationHint? }
 * - multipart/form-data (with files):
 *     message:       string
 *     threadId?:     string
 *     locationHint?: string
 *     file:          File   (repeat the field; up to 5 files, ≤10MB each)
 *
 * Honors `Accept: text/event-stream` for SSE; otherwise returns JSON.
 *
 * Files are validated, base64-encoded in-memory, and passed inline to Gemini.
 * Bytes are NOT persisted; only attachment metadata (name/type/size) is stored
 * with the user message so the UI can render an icon next to the message.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateChatTurn,
  streamChatTurn,
  type ChatTurnAttachment,
  type ChatTurnMessage,
} from "@/lib/ai/gemini.server";
import { SUPPLY_INTAKE_SYSTEM_PROMPT } from "@/lib/ai/chatPrompt";
import {
  formatAnonymousIdCookie,
  resolveAnonymousId,
  setAnonymousIdCookie,
} from "@/lib/chat/anonId.server";
import {
  appendTurn,
  createThread,
  loadThread,
} from "@/lib/chat/threads.server";
import { getCurrentUserFromRequest } from "@/lib/auth/server";
import type { ChatAttachmentMeta, ChatMessage } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

type ParsedRequest = {
  message: string;
  threadId: string | null;
  locationHint?: string;
  attachments: ChatTurnAttachment[];
  attachmentMeta: ChatAttachmentMeta[];
};

type ParseError = { code: string; message: string; status: 400 | 413 | 415 };

function classifyGeminiError(message: string): {
  status: 500 | 502;
  code: "GEMINI_ERROR" | "GEMINI_AUTH_ERROR";
} {
  const isAuth = /API key|UNAUTHENTICATED|PERMISSION_DENIED/i.test(message);
  return isAuth
    ? { status: 502, code: "GEMINI_AUTH_ERROR" }
    : { status: 500, code: "GEMINI_ERROR" };
}

async function parseRequest(
  req: NextRequest
): Promise<ParsedRequest | ParseError> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return {
        code: "INVALID_FORM",
        message: "Could not parse multipart body",
        status: 400,
      };
    }

    const message = (form.get("message") ?? "").toString().trim();
    if (!message) {
      return {
        code: "MISSING_MESSAGE",
        message: "`message` is required",
        status: 400,
      };
    }

    const threadIdRaw = form.get("threadId");
    const threadId =
      typeof threadIdRaw === "string" && threadIdRaw.length > 0
        ? threadIdRaw
        : null;
    const locationHintRaw = form.get("locationHint");
    const locationHint =
      typeof locationHintRaw === "string" && locationHintRaw.trim()
        ? locationHintRaw.trim()
        : undefined;

    const fileEntries = form
      .getAll("file")
      .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v);

    if (fileEntries.length > MAX_FILES) {
      return {
        code: "TOO_MANY_FILES",
        message: `At most ${MAX_FILES} files per turn`,
        status: 400,
      };
    }

    const attachments: ChatTurnAttachment[] = [];
    const attachmentMeta: ChatAttachmentMeta[] = [];
    for (const file of fileEntries) {
      if (file.size > MAX_FILE_BYTES) {
        return {
          code: "FILE_TOO_LARGE",
          message: `"${file.name}" exceeds ${MAX_FILE_BYTES / (1024 * 1024)} MB`,
          status: 413,
        };
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return {
          code: "UNSUPPORTED_MIME_TYPE",
          message: `"${file.name}" has unsupported type ${file.type || "<unknown>"}`,
          status: 415,
        };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      attachments.push({ mimeType: file.type, data: bytes });
      attachmentMeta.push({
        name: file.name || "",
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    return { message, threadId, locationHint, attachments, attachmentMeta };
  }

  // JSON path
  let body: { message?: unknown; threadId?: unknown; locationHint?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return { code: "INVALID_JSON", message: "Body must be JSON", status: 400 };
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return {
      code: "MISSING_MESSAGE",
      message: "`message` is required",
      status: 400,
    };
  }
  const threadId =
    typeof body.threadId === "string" && body.threadId.length > 0
      ? body.threadId
      : null;
  const locationHint =
    typeof body.locationHint === "string" && body.locationHint.trim()
      ? body.locationHint.trim()
      : undefined;

  return {
    message,
    threadId,
    locationHint,
    attachments: [],
    attachmentMeta: [],
  };
}

export async function POST(req: NextRequest) {
  const parsed = await parseRequest(req);
  if ("code" in parsed && "status" in parsed) {
    return NextResponse.json(
      { ok: false, code: parsed.code, message: parsed.message },
      { status: parsed.status }
    );
  }

  const { message, threadId: requestedThreadId, locationHint, attachments, attachmentMeta } =
    parsed;

  // Resolve owner identity
  const user = await getCurrentUserFromRequest(req);
  const { anonymousId, setCookie } = user
    ? { anonymousId: "", setCookie: false }
    : resolveAnonymousId(req);
  const owner = user ? { userId: user.id } : { anonymousId };

  // Load existing thread or create new
  let thread = requestedThreadId
    ? await loadThread(requestedThreadId, owner)
    : null;
  if (requestedThreadId && !thread) {
    return NextResponse.json(
      { ok: false, code: "THREAD_NOT_FOUND", message: "Thread not found" },
      { status: 404 }
    );
  }
  if (!thread) {
    thread = await createThread(owner);
  }

  const userMessage: ChatMessage = {
    role: "user",
    text: message,
    createdAt: new Date().toISOString(),
    ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {}),
  };

  const history: ChatTurnMessage[] = [
    ...thread.messages.map((m) => ({ role: m.role, text: m.text })),
    { role: "user" as const, text: message },
  ];

  const wantsStream = (req.headers.get("accept") || "").includes(
    "text/event-stream"
  );

  if (!wantsStream) {
    return handleJson({
      thread,
      owner,
      userMessage,
      history,
      attachments,
      locationHint,
      setCookie,
      anonymousId,
    });
  }

  return handleStream({
    thread,
    owner,
    userMessage,
    history,
    attachments,
    locationHint,
    setCookie,
    anonymousId,
  });
}

// --- JSON path ---------------------------------------------------------------

async function handleJson(args: {
  thread: { id: string; messages: ChatMessage[] };
  owner: { userId?: string; anonymousId?: string };
  userMessage: ChatMessage;
  history: ChatTurnMessage[];
  attachments: ChatTurnAttachment[];
  locationHint?: string;
  setCookie: boolean;
  anonymousId: string;
}) {
  let reply: { text: string; usage?: { input?: number; output?: number } };
  try {
    reply = await generateChatTurn({
      history: args.history,
      systemPrompt: SUPPLY_INTAKE_SYSTEM_PROMPT,
      locationHint: args.locationHint,
      attachments: args.attachments,
    });
  } catch (error: any) {
    const message = error?.message ?? "Gemini call failed";
    const { status, code } = classifyGeminiError(message);
    return NextResponse.json({ ok: false, code, message }, { status });
  }

  const assistantMessage: ChatMessage = {
    role: "model",
    text: reply.text,
    createdAt: new Date().toISOString(),
  };

  await appendTurn(args.thread.id, args.userMessage, assistantMessage, args.owner);

  const response = NextResponse.json(
    {
      ok: true,
      threadId: args.thread.id,
      reply: assistantMessage,
      usage: reply.usage,
    },
    { status: 200 }
  );
  if (args.setCookie) setAnonymousIdCookie(response, args.anonymousId);
  return response;
}

// --- SSE path ----------------------------------------------------------------

function sseHeaders(setCookie: boolean, anonymousId: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  if (setCookie) headers["Set-Cookie"] = formatAnonymousIdCookie(anonymousId);
  return headers;
}

function sseFrame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function handleStream(args: {
  thread: { id: string; messages: ChatMessage[] };
  owner: { userId?: string; anonymousId?: string };
  userMessage: ChatMessage;
  history: ChatTurnMessage[];
  attachments: ChatTurnAttachment[];
  locationHint?: string;
  setCookie: boolean;
  anonymousId: string;
}): Response {
  const { thread, owner, userMessage, history, locationHint, attachments } = args;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(sseFrame(payload));

      send({ type: "start", threadId: thread.id });

      let assembled = "";
      let usage: { input?: number; output?: number } | undefined;

      try {
        for await (const event of streamChatTurn({
          history,
          systemPrompt: SUPPLY_INTAKE_SYSTEM_PROMPT,
          locationHint,
          attachments,
        })) {
          if ("delta" in event) {
            assembled += event.delta;
            send({ type: "text", delta: event.delta });
          } else if (event.done) {
            usage = event.usage;
          }
        }

        const assistantMessage: ChatMessage = {
          role: "model",
          text: assembled,
          createdAt: new Date().toISOString(),
        };
        await appendTurn(thread.id, userMessage, assistantMessage, owner);

        send({
          type: "done",
          createdAt: assistantMessage.createdAt,
          usage,
        });
      } catch (error: any) {
        const message = error?.message ?? "Gemini call failed";
        const { code } = classifyGeminiError(message);
        send({ type: "error", code, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: sseHeaders(args.setCookie, args.anonymousId),
  });
}
