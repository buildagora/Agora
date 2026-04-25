"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import type {
  ChatAttachmentMeta,
  ChatMessage,
  ChatThreadSummary,
} from "@/lib/chat/types";

const LOCATION_KEY = "agora:chat_location";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type StoredLocation = {
  label: string;
  lat?: number;
  lng?: number;
};

async function forwardGeocodeQuery(
  query: string
): Promise<StoredLocation | null> {
  try {
    const res = await fetch("/api/chat/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (data?.ok) {
      return { label: data.label, lat: data.lat, lng: data.lng };
    }
  } catch {
    /* fall through */
  }
  return null;
}

type StreamEvent =
  | { type: "start"; threadId: string }
  | { type: "text"; delta: string }
  | { type: "done"; createdAt: string }
  | { type: "error"; code: string; message: string };

export default function ChatClient() {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingUser, setPendingUser] = useState<ChatMessage | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [location, setLocation] = useState<StoredLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate location from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCATION_KEY);
      if (raw) setLocation(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Load thread list on mount
  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/threads", { credentials: "include" });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.threads)) setThreads(data.threads);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  // Auto-scroll to bottom when content grows
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText, pendingUser]);

  const persistLocation = (loc: StoredLocation | null) => {
    setLocation(loc);
    try {
      if (loc) localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      else localStorage.removeItem(LOCATION_KEY);
    } catch {
      /* ignore */
    }
  };

  const requestBrowserLocation = () => {
    if (!navigator.geolocation) {
      const manual = window.prompt("Enter your city or ZIP:");
      if (manual && manual.trim()) {
        forwardGeocodeQuery(manual.trim()).then((resolved) =>
          persistLocation(resolved ?? { label: manual.trim() })
        );
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch("/api/chat/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng }),
          });
          const data = await res.json();
          const label =
            data?.ok && typeof data.label === "string"
              ? data.label
              : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
          persistLocation({ label, lat, lng });
        } catch {
          persistLocation({ label: `${lat.toFixed(2)}, ${lng.toFixed(2)}`, lat, lng });
        }
      },
      async () => {
        const manual = window.prompt(
          "Couldn't get your location automatically. Enter your city or ZIP:"
        );
        if (manual && manual.trim()) {
          const resolved = await forwardGeocodeQuery(manual.trim());
          persistLocation(resolved ?? { label: manual.trim() });
        }
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        setError(`At most ${MAX_FILES} files at a time.`);
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" exceeds 10 MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = async () => {
    if (isStreaming) return;
    const text = draft.trim();
    if (!text) return;
    setError(null);

    const userMsg: ChatMessage = {
      role: "user",
      text,
      createdAt: new Date().toISOString(),
      ...(files.length > 0
        ? {
            attachments: files.map<ChatAttachmentMeta>((f) => ({
              name: f.name,
              mimeType: f.type,
              sizeBytes: f.size,
            })),
          }
        : {}),
    };
    setPendingUser(userMsg);
    setDraft("");
    setStreamingText("");
    setIsStreaming(true);

    let body: BodyInit;
    let headers: HeadersInit = { Accept: "text/event-stream" };
    if (files.length > 0) {
      const fd = new FormData();
      fd.set("message", text);
      if (threadId) fd.set("threadId", threadId);
      if (location?.label) fd.set("locationHint", location.label);
      for (const f of files) fd.append("file", f);
      body = fd;
    } else {
      headers = { ...headers, "Content-Type": "application/json" };
      body = JSON.stringify({
        message: text,
        threadId: threadId ?? undefined,
        locationHint: location?.label,
      });
    }

    let assembled = "";
    let receivedThreadId: string | null = threadId;
    try {
      const res = await fetch("/api/chat/turn", {
        method: "POST",
        headers,
        body,
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let payload: StreamEvent;
          try {
            payload = JSON.parse(line.slice(6)) as StreamEvent;
          } catch {
            continue;
          }
          if (payload.type === "start") {
            receivedThreadId = payload.threadId;
            setThreadId(payload.threadId);
          } else if (payload.type === "text") {
            assembled += payload.delta;
            setStreamingText(assembled);
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
      }

      // Stream finished — commit messages
      const assistantMsg: ChatMessage = {
        role: "model",
        text: assembled,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setPendingUser(null);
      setStreamingText("");
      setFiles([]);
      if (receivedThreadId) setThreadId(receivedThreadId);
      refreshThreads();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setPendingUser(null);
      setStreamingText("");
    } finally {
      setIsStreaming(false);
    }
  };

  const startNewChat = () => {
    setThreadId(null);
    setMessages([]);
    setPendingUser(null);
    setStreamingText("");
    setFiles([]);
    setError(null);
    setDrawerOpen(false);
  };

  const seeSuppliers = async () => {
    if (isSearching || isStreaming) return;
    if (!threadId) {
      setError("Send a message first.");
      return;
    }
    if (!location?.lat || !location.lng) {
      setError("Add your location first.");
      return;
    }
    const firstUser = messages.find((m) => m.role === "user");
    const query = firstUser?.text?.trim();
    if (!query) {
      setError("Tell us what you're looking for first.");
      return;
    }

    setError(null);
    setIsSearching(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          threadId,
          query,
          location: {
            label: location.label,
            lat: location.lat,
            lng: location.lng,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      router.push(`/search/${data.threadId}/${data.searchId}`);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setIsSearching(false);
    }
  };

  const canSearch =
    !!threadId &&
    messages.length > 0 &&
    !!location?.lat &&
    !!location.lng &&
    !isStreaming &&
    !isSearching;

  const loadThread = async (id: string) => {
    setError(null);
    setDrawerOpen(false);
    try {
      const res = await fetch(`/api/chat/threads/${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "Could not load thread");
      setThreadId(data.thread.id);
      setMessages(data.thread.messages || []);
      setPendingUser(null);
      setStreamingText("");
    } catch (e: any) {
      setError(e?.message || "Could not load thread");
    }
  };

  const showEmptyState = messages.length === 0 && !pendingUser && !isStreaming;
  const visibleMessages = useMemo(() => {
    const list: ChatMessage[] = [...messages];
    if (pendingUser) list.push(pendingUser);
    if (isStreaming || streamingText) {
      list.push({
        role: "model",
        text: streamingText,
        createdAt: new Date().toISOString(),
      });
    }
    return list;
  }, [messages, pendingUser, isStreaming, streamingText]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader drawerOpen={drawerOpen} onDrawerOpenChange={setDrawerOpen} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {drawerOpen && (
          <aside className="hidden w-72 shrink-0 border-r border-zinc-200 bg-zinc-50 md:block md:self-stretch">
            <ThreadsSidebar
              threads={threads}
              activeThreadId={threadId}
              onSelect={loadThread}
              onNew={startNewChat}
            />
          </aside>
        )}

        <main className="flex min-h-0 w-full flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-3xl py-8">
              {showEmptyState ? (
                <EmptyState />
              ) : (
                <ul className="space-y-4">
                  {visibleMessages.map((m, idx) => (
                    <li key={idx}>
                      <MessageBubble message={m} streaming={isStreaming && idx === visibleMessages.length - 1 && m.role === "model"} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div className="mx-auto w-full max-w-3xl">
              {(files.length > 0 || error) && (
                <div className="mb-3 space-y-2">
                  {files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {files.map((f, i) => (
                        <FileChip key={i} file={f} onRemove={() => removeFile(i)} />
                      ))}
                    </div>
                  )}
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}

              <div className="mb-2 flex items-center justify-between gap-2">
                <LocationPill
                  label={location?.label ?? null}
                  onSet={requestBrowserLocation}
                  onClear={() => persistLocation(null)}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={seeSuppliers}
                    disabled={!canSearch}
                    title={
                      !threadId || messages.length === 0
                        ? "Send a message first"
                        : !location?.lat
                        ? "Add your location first"
                        : "Find suppliers nearby"
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                  >
                    See suppliers →
                  </button>
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="text-xs text-zinc-500 transition hover:text-zinc-800"
                  >
                    New chat
                  </button>
                </div>
              </div>

              <Composer
                draft={draft}
                onDraftChange={setDraft}
                onSend={send}
                onAttach={() => fileInputRef.current?.click()}
                disabled={isStreaming}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
          </div>
        </main>
      </div>

      <SiteFooter />

      {isSearching && <SearchingOverlay location={location?.label ?? ""} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SearchingOverlay({ location }: { location: string }) {
  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-700 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-700 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-700" />
        </div>
        <p className="text-[15px] text-zinc-800">
          Finding suppliers{location ? ` in ${location}` : ""}…
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center pt-12 text-center">
      <h1 className="text-[20px] font-normal leading-snug text-zinc-700 sm:text-[24px]">
        Tell us what you&apos;re looking for
      </h1>
      <p className="mt-3 max-w-md text-sm text-zinc-500 sm:text-[15px]">
        Describe the materials you need, attach photos or specs, and we&apos;ll
        help refine the request before sending it to suppliers in your area.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md bg-zinc-900 text-white"
            : "rounded-bl-md border border-zinc-200 bg-white text-zinc-800"
        }`}
      >
        {message.text || (streaming ? <TypingDots /> : null)}
        {streaming && message.text && (
          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current align-middle" />
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : ""}`}>
            {message.attachments.map((a, i) => (
              <span
                key={i}
                className={`inline-flex max-w-[200px] items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs ${
                  isUser
                    ? "bg-zinc-700/70 text-zinc-50"
                    : "bg-zinc-100 text-zinc-700"
                }`}
                title={`${a.name} • ${(a.sizeBytes / 1024).toFixed(0)} KB`}
              >
                <PaperclipIcon className="h-3 w-3" />
                <span className="truncate">{a.name || a.mimeType}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
    </span>
  );
}

function Composer({
  draft,
  onDraftChange,
  onSend,
  onAttach,
  disabled,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  onAttach: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 items-center rounded-full border border-zinc-200 bg-white py-3 pl-3 pr-2 shadow-sm transition-shadow focus-within:shadow-md hover:shadow-md sm:pl-4">
      <button
        type="button"
        onClick={onAttach}
        disabled={disabled}
        className="flex shrink-0 items-center justify-center rounded-full p-2 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50"
        aria-label="Attach files"
      >
        <PaperclipIcon className="h-5 w-5" />
      </button>
      <div className="mx-2 h-6 w-px shrink-0 self-center bg-zinc-200" aria-hidden />
      <input
        type="text"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Describe what you need..."
        className="min-w-0 flex-1 bg-transparent text-base text-zinc-800 outline-none placeholder:text-zinc-400 sm:text-[17px]"
        disabled={disabled}
      />
      <div className="mx-2 h-6 w-px shrink-0 self-center bg-zinc-200" aria-hidden />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !draft.trim()}
        className="flex shrink-0 items-center justify-center rounded-full bg-zinc-900 p-2.5 text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
        aria-label="Send"
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function LocationPill({
  label,
  onSet,
  onClear,
}: {
  label: string | null;
  onSet: () => void;
  onClear: () => void;
}) {
  if (!label) {
    return (
      <button
        type="button"
        onClick={onSet}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-800"
      >
        <PinIcon className="h-3.5 w-3.5" />
        Add location
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
      <PinIcon className="h-3.5 w-3.5" />
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full text-zinc-400 transition hover:text-zinc-700"
        aria-label="Clear location"
      >
        ×
      </button>
    </span>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-[260px] items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
      <PaperclipIcon className="h-3.5 w-3.5" />
      <span className="truncate">{file.name}</span>
      <span className="text-zinc-400">{(file.size / 1024).toFixed(0)} KB</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded-full text-zinc-400 transition hover:text-zinc-700"
        aria-label="Remove file"
      >
        ×
      </button>
    </span>
  );
}

function ThreadsSidebar({
  threads,
  activeThreadId,
  onSelect,
  onNew,
}: {
  threads: ChatThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Recent chats
        </h2>
        <button
          type="button"
          onClick={onNew}
          className="text-xs text-zinc-600 transition hover:text-zinc-900"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="px-4 py-6 text-xs text-zinc-400">No chats yet.</p>
        ) : (
          <ul className="py-2">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={`block w-full truncate px-4 py-2 text-left text-sm transition ${
                    t.id === activeThreadId
                      ? "bg-zinc-200 text-zinc-900"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                  title={t.title || "Untitled"}
                >
                  {t.title || "Untitled chat"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny inline icons (SVG) — match the SearchGlyph style on the landing page.

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
