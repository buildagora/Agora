"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type RecentSearch = {
  id: string;
  text: string;
  url: string;
  createdAt: number;
};

function formatRecentTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Mobile overlay for recent searches. Desktop uses `RecentSearchesSidebar` in page flow. */
export default function RecentSearchesDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const raw = localStorage.getItem("agora:recent_searches");
    if (raw) {
      try {
        setSearches(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const drawerStyle = {
    top: "4rem",
    height: "calc(100vh - 4rem)" as const,
  };

  const portalContent = (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed bottom-0 left-0 right-0 top-16 z-[90] cursor-default bg-black/30"
        onClick={onClose}
      />

      <aside
        className="fixed left-0 z-[100] flex w-80 max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-r border-zinc-200 border-t border-zinc-300 bg-zinc-50"
        style={drawerStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-searches-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <h2
            id="recent-searches-heading"
            className="mb-4 text-sm font-semibold tracking-tight text-zinc-900"
          >
            Recent Searches
          </h2>

          {searches.length === 0 ? (
            <p className="text-sm text-zinc-500">No recent searches yet.</p>
          ) : (
            <nav aria-label="Recent searches">
              <ul className="flex flex-col gap-0.5">
                {searches.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.url}
                      className="group block rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100/90"
                    >
                      <span className="line-clamp-2 text-sm leading-snug text-zinc-800">
                        {s.text}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-zinc-400">
                        {formatRecentTimestamp(s.createdAt)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </aside>
    </>
  );

  return createPortal(portalContent, document.body);
}
