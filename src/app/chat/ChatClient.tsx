"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";
import AgoraLogo from "@/components/brand/AgoraLogo";
import SearchHero from "@/components/search-home/SearchHero";
import HomeSearchBar from "@/components/search-home/HomeSearchBar";
import PopularCategoriesSection from "@/components/search-home/PopularCategoriesSection";
import PopularBrandsSection from "@/components/search-home/PopularBrandsSection";
import SuggestedSearchChips from "@/components/search-home/SuggestedSearchChips";
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

  /**
   * Resolve a usable location for the search. If we already have one cached,
   * returns it immediately. Otherwise prompts the browser for geolocation
   * and falls back to a manual prompt. Returns the resolved location or
   * null if the user declined and didn't enter anything manually.
   *
   * Used both by the location pill click handler (fire-and-forget) and by
   * the "See suppliers" flow (awaited, so the search runs as soon as a
   * location is available).
   */
  const ensureLocation = (): Promise<StoredLocation | null> => {
    if (location?.lat && location.lng) return Promise.resolve(location);

    return new Promise<StoredLocation | null>((resolve) => {
      const manualFallback = async (
        promptText = "Enter your city or ZIP:"
      ) => {
        const manual = window.prompt(promptText);
        if (!manual || !manual.trim()) {
          resolve(null);
          return;
        }
        const resolved =
          (await forwardGeocodeQuery(manual.trim())) ?? { label: manual.trim() };
        persistLocation(resolved);
        resolve(resolved);
      };

      if (!navigator.geolocation) {
        void manualFallback();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          let label: string;
          try {
            const res = await fetch("/api/chat/geocode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat, lng }),
            });
            const data = await res.json();
            label =
              data?.ok && typeof data.label === "string"
                ? data.label
                : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
          } catch {
            label = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
          }
          const resolved: StoredLocation = { label, lat, lng };
          persistLocation(resolved);
          resolve(resolved);
        },
        async () => {
          await manualFallback(
            "Couldn't get your location automatically. Enter your city or ZIP:"
          );
        },
        { timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
  };

  /** Click handler for the location pill — fire-and-forget. */
  const requestBrowserLocation = () => {
    void ensureLocation();
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

  const send = async (queryOverride?: string) => {
    if (isStreaming) return;
    const text = (queryOverride ?? draft).trim();
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

  const seeSuppliers = async () => {
    if (isSearching || isStreaming) return;
    if (!threadId) {
      setError("Send a message first.");
      return;
    }
    const firstUser = messages.find((m) => m.role === "user");
    const query = firstUser?.text?.trim();
    if (!query) {
      setError("Tell us what you're looking for first.");
      return;
    }

    setError(null);

    // Make sure we have a location with coords. ensureLocation prompts the
    // browser geolocation API and falls back to a manual prompt; on mobile
    // this means the buyer can tap "See suppliers" without first having
    // tapped "Add location" — the location request happens inline.
    let loc: StoredLocation | null = location;
    if (!loc?.lat || !loc.lng) {
      loc = await ensureLocation();
      if (!loc?.lat || !loc.lng) {
        setError("We need your location to find nearby suppliers.");
        return;
      }
    }

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
            label: loc.label,
            lat: loc.lat,
            lng: loc.lng,
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

  // Button is enabled whenever there's a chat in progress; location is
  // handled inline by seeSuppliers when tapped.
  const canSearch =
    !!threadId &&
    messages.length > 0 &&
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

  const startNewSearch = () => {
    if (isStreaming || isSearching) return;
    setThreadId(null);
    setMessages([]);
    setPendingUser(null);
    setStreamingText("");
    setDraft("");
    setFiles([]);
    setError(null);
    router.replace("/");
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

  const showDiscovery = showEmptyState && !isStreaming;

  const submitDiscoveryQuery = (query: string) => {
    if (isStreaming) return;
    void send(query);
  };

  const sidebarProps = {
    threads,
    activeThreadId: threadId,
    onSelect: loadThread,
    locationLabel: location?.label ?? null,
    onSetLocation: requestBrowserLocation,
    onClearLocation: () => persistLocation(null),
  };

  const searchBarProps = {
    value: draft,
    onDraftChange: setDraft,
    onSend: send,
    disabled: isStreaming,
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white">
      <SiteHeader
        layout="searchHomeMobile"
        drawerOpen={drawerOpen}
        onDrawerOpenChange={setDrawerOpen}
        showLogo={false}
        trailing={
          <LocationPill
            label={location?.label ?? null}
            onSet={requestBrowserLocation}
            onClear={() => persistLocation(null)}
            compact
            soft
          />
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-200 bg-stone-50/70 md:flex">
          <SearchSidebar {...sidebarProps} />
        </aside>

        {drawerOpen ? (
          <MobileSearchSidebar
            {...sidebarProps}
            onClose={() => setDrawerOpen(false)}
          />
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {showEmptyState ? (
            <>
              <div className="hidden shrink-0 justify-end px-4 py-3 sm:px-8 md:flex lg:px-10">
                <LocationPill
                  label={location?.label ?? null}
                  onSet={requestBrowserLocation}
                  onClear={() => persistLocation(null)}
                  showChevron
                  soft
                />
              </div>

              <div
                ref={scrollRef}
                className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto bg-gradient-to-b from-white to-stone-50/50 px-4 sm:px-8 lg:px-10"
              >
                <div className="flex w-full min-w-0 flex-col pb-14 pt-8 sm:pt-10">
                  <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5 sm:space-y-6">
                    <SearchHero />
                    <HomeSearchBar {...searchBarProps} />
                    {(files.length > 0 || error) && (
                      <SearchAlerts
                        files={files}
                        error={error}
                        onRemoveFile={removeFile}
                      />
                    )}
                    {showDiscovery ? (
                      <SuggestedSearchChips
                        onSelect={submitDiscoveryQuery}
                        disabled={isStreaming}
                      />
                    ) : null}
                  </div>

                  {showDiscovery ? (
                    <div className="mx-auto w-full min-w-0 max-w-3xl md:max-w-none md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
                      <PopularCategoriesSection
                        onSelect={submitDiscoveryQuery}
                        disabled={isStreaming}
                      />
                      <PopularBrandsSection
                        onSelect={submitDiscoveryQuery}
                        disabled={isStreaming}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-10"
              >
                <div className="mx-auto w-full max-w-3xl py-6 sm:py-8">
                  <ul className="space-y-4">
                    {visibleMessages.map((m, idx) => (
                      <li key={idx}>
                        <MessageBubble
                          message={m}
                          streaming={
                            isStreaming &&
                            idx === visibleMessages.length - 1 &&
                            m.role === "model"
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-4 sm:px-8 sm:py-5 lg:px-10">
                <div className="mx-auto w-full max-w-3xl">
                  {(files.length > 0 || error) && (
                    <div className="mb-3">
                      <SearchAlerts
                        files={files}
                        error={error}
                        onRemoveFile={removeFile}
                      />
                    </div>
                  )}

                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                    <button
                      type="button"
                      onClick={startNewSearch}
                      disabled={isStreaming || isSearching}
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent bg-[#1E3A5F] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#1E3A5F]/25 transition hover:bg-[#172e4c] disabled:border-transparent disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
                    >
                      ← New Search
                    </button>
                    <button
                      type="button"
                      onClick={seeSuppliers}
                      disabled={!canSearch}
                      title={
                        !threadId || messages.length === 0
                          ? "Send a message first"
                          : "Find suppliers nearby"
                      }
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent bg-[#1E3A5F] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#1E3A5F]/25 transition hover:bg-[#172e4c] disabled:border-transparent disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
                    >
                      See suppliers
                      <ArrowRightSmall className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mb-3">
                    <LocationPill
                      label={location?.label ?? null}
                      onSet={requestBrowserLocation}
                      onClear={() => persistLocation(null)}
                    />
                  </div>

                  <Composer
                    draft={draft}
                    onDraftChange={setDraft}
                    onSend={send}
                    onAttach={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                  />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <SiteFooter />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

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
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#1E3A5F] [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#1E3A5F] [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#1E3A5F]" />
        </div>
        <p className="text-[15px] text-zinc-800">
          Finding suppliers{location ? ` in ${location}` : ""}…
        </p>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function SearchAlerts({
  files,
  error,
  onRemoveFile,
}: {
  files: File[];
  error: string | null;
  onRemoveFile: (idx: number) => void;
}) {
  return (
    <div className="space-y-2">
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <FileChip key={i} file={f} onRemove={() => onRemoveFile(i)} />
          ))}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm sm:text-base ${
          isUser
            ? "rounded-br-md bg-[#1E3A5F] text-white"
            : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900"
        }`}
      >
        {message.text || (streaming ? <TypingDots /> : null)}
        {streaming && message.text ? (
          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current align-middle" />
        ) : null}
        {message.attachments && message.attachments.length > 0 ? (
          <div className={`mt-2 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : ""}`}>
            {message.attachments.map((a, i) => (
              <span
                key={i}
                className={`inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[13px] font-medium ${
                  isUser
                    ? "bg-[#172e4c]/70 text-zinc-50"
                    : "bg-zinc-100 text-zinc-700"
                }`}
                title={`${a.name} • ${(a.sizeBytes / 1024).toFixed(0)} KB`}
              >
                <PaperclipIcon className="h-3.5 w-3.5" />
                <span className="truncate">{a.name || a.mimeType}</span>
              </span>
            ))}
          </div>
        ) : null}
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`;
  }, [draft]);

  return (
    <div className="flex w-full min-w-0 items-end gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm transition-shadow focus-within:border-zinc-300 focus-within:shadow-md sm:gap-2 sm:p-2.5">
      <button
        type="button"
        onClick={onAttach}
        disabled={disabled}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
        aria-label="Attach files"
      >
        <PaperclipIcon className="h-5 w-5" />
      </button>
      <textarea
        ref={textareaRef}
        rows={1}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Describe what you need…"
        className="block min-w-0 flex-1 resize-none self-center bg-transparent px-2 py-2 text-[15px] leading-snug text-zinc-900 outline-none placeholder:text-zinc-400 sm:text-base"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !draft.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1E3A5F] text-white transition hover:bg-[#172e4c] disabled:bg-zinc-200 disabled:text-zinc-400"
        aria-label="Send"
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

const RECENT_SEARCH_PREVIEW = 6;

function SearchSidebar({
  threads,
  activeThreadId,
  onSelect,
  locationLabel,
  onSetLocation,
  onClearLocation,
}: {
  threads: ChatThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  locationLabel: string | null;
  onSetLocation: () => void;
  onClearLocation: () => void;
}) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  const visibleThreads = showAllHistory
    ? threads
    : threads.slice(0, RECENT_SEARCH_PREVIEW);
  const hasMoreHistory = threads.length > RECENT_SEARCH_PREVIEW;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pb-2 pt-5">
        <AgoraLogo variant="header" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Recent searches
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="px-1 py-2 text-sm text-zinc-500">No recent searches yet.</p>
          ) : (
            <nav aria-label="Recent searches">
              <ul className="flex flex-col gap-0.5">
                {visibleThreads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(t.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                        t.id === activeThreadId
                          ? "bg-white/80 text-zinc-900 shadow-sm shadow-zinc-200/50"
                          : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900"
                      }`}
                    >
                      <ClockIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {t.title || "Untitled search"}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
                        {formatRelativeTime(t.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        {hasMoreHistory ? (
          <button
            type="button"
            onClick={() => setShowAllHistory((prev) => !prev)}
            className="mt-3 px-2.5 text-left text-sm font-medium text-[#1E3A5F] transition hover:text-[#172e4c]"
          >
            {showAllHistory ? "Show less" : "View all history"}
          </button>
        ) : null}
      </div>

      <div className="px-4 pb-5 pt-2">
        <LocationPill
          label={locationLabel}
          onSet={onSetLocation}
          onClear={onClearLocation}
          showChevron
          soft
        />
      </div>
    </div>
  );
}

function MobileSearchSidebar({
  threads,
  activeThreadId,
  onSelect,
  locationLabel,
  onSetLocation,
  onClearLocation,
  onClose,
}: {
  threads: ChatThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  locationLabel: string | null;
  onSetLocation: () => void;
  onClearLocation: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 top-14 z-40 bg-black/30 md:hidden"
        onClick={onClose}
      />
      <aside className="fixed left-0 top-14 z-50 flex h-[calc(100vh-3.5rem)] w-72 max-w-[85vw] flex-col bg-stone-50/95 shadow-xl shadow-zinc-900/5 md:hidden">
        <SearchSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={(id) => {
            onSelect(id);
            onClose();
          }}
          locationLabel={locationLabel}
          onSetLocation={onSetLocation}
          onClearLocation={onClearLocation}
        />
      </aside>
    </>
  );
}

function LocationPill({
  label,
  onSet,
  onClear,
  compact = false,
  showChevron = false,
  soft = false,
}: {
  label: string | null;
  onSet: () => void;
  onClear: () => void;
  compact?: boolean;
  showChevron?: boolean;
  soft?: boolean;
}) {
  const baseClass = compact
    ? soft
      ? "inline-flex max-w-[200px] items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-zinc-700 shadow-sm shadow-zinc-200/60"
      : "inline-flex max-w-[200px] items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-700"
    : soft
      ? "inline-flex max-w-[240px] items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-medium text-zinc-700 shadow-sm shadow-zinc-200/60 transition hover:bg-white hover:shadow-md hover:shadow-zinc-200/70"
      : "inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50";

  if (!label) {
    return (
      <button type="button" onClick={onSet} className={baseClass}>
        <PinIcon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        <span className="truncate">{compact ? "Location" : "Add location"}</span>
        {showChevron ? <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSet}
      className={
        compact
          ? soft
            ? "inline-flex max-w-[220px] items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-zinc-800 shadow-sm shadow-zinc-200/60"
            : "inline-flex max-w-[220px] items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[12px] font-medium text-zinc-800"
          : soft
            ? "inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-medium text-zinc-800 shadow-sm shadow-zinc-200/60 transition hover:bg-white hover:shadow-md hover:shadow-zinc-200/70"
            : "inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[13px] font-medium text-zinc-800 transition hover:border-zinc-300"
      }
    >
      <PinIcon className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0 text-zinc-500`} />
      <span className="truncate">{label}</span>
      {showChevron ? (
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }
          }}
          className="ml-0.5 shrink-0 rounded-full text-zinc-400 transition hover:text-zinc-700"
          aria-label="Clear location"
        >
          ×
        </span>
      )}
    </button>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-[260px] items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[13px] font-medium text-zinc-800">
      <PaperclipIcon className="h-3.5 w-3.5 text-zinc-500" />
      <span className="truncate">{file.name}</span>
      <span className="text-zinc-500">{(file.size / 1024).toFixed(0)} KB</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full text-zinc-400 transition hover:text-zinc-700"
        aria-label="Remove file"
      >
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tiny inline icons (SVG)

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

function ClockIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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

function ChevronDownIcon({ className }: { className?: string }) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ArrowRightSmall({ className }: { className?: string }) {
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
