"use client";

import { HOME_SUGGESTED_SEARCHES } from "@/lib/search/homeDiscovery";

export default function SuggestedSearchChips({
  onSelect,
  disabled = false,
}: {
  onSelect: (query: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col items-center gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-center sm:gap-2.5">
      <p className="shrink-0 text-xs text-zinc-800 sm:text-sm">Try searching:</p>
      <ul className="flex min-w-0 flex-nowrap items-center justify-center gap-1.5 sm:gap-2">
        {HOME_SUGGESTED_SEARCHES.map((item) => (
          <li key={item.id} className="shrink-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.query)}
              className="whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1.5 text-xs text-zinc-700 transition hover:bg-white hover:shadow-sm hover:shadow-zinc-200/80 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:text-sm"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
