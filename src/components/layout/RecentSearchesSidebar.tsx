"use client";

import { useEffect, useState } from "react";

type RecentSearch = {
  id: string;
  text: string;
  url: string;
  createdAt: number;
};

const STORAGE_KEY = "agora:recent_searches";

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

function loadSearches(): RecentSearch[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

export default function RecentSearchesSidebar() {
  const [searches, setSearches] = useState<RecentSearch[]>([]);

  useEffect(() => {
    const refresh = () => setSearches(loadSearches());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <div className="h-full px-4 py-5">
      <h2 className="mb-4 text-sm font-semibold tracking-tight text-zinc-900">
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
  );
}
