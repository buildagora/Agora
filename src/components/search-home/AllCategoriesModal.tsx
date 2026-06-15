"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  categoryIconSrc,
  HOME_CATEGORY_CATALOG,
  type HomeCategoryCatalogEntry,
} from "@/lib/search/homeDiscovery";

export default function AllCategoriesModal({
  open,
  onClose,
  onSelectCategory,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  onSelectCategory: (query: string) => void;
  disabled?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (entry: HomeCategoryCatalogEntry) => {
      if (disabled) return;
      onSelectCategory(entry.query);
      onClose();
    },
    [disabled, onClose, onSelectCategory]
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close category list"
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-categories-title"
        tabIndex={-1}
        className="relative flex max-h-[min(88vh,720px)] w-full flex-col rounded-t-2xl bg-white shadow-xl shadow-zinc-900/10 outline-none sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <h2
            id="all-categories-title"
            className="text-lg font-semibold text-[#1E3A5F]"
          >
            All categories
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {HOME_CATEGORY_CATALOG.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(entry)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm shadow-zinc-200/50 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-zinc-200/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-50">
                    <Image
                      src={categoryIconSrc(entry.iconSlug)}
                      alt=""
                      width={22}
                      height={22}
                      className="h-[22px] w-[22px] object-contain opacity-80 [filter:brightness(0)_saturate(100%)_invert(16%)_sepia(28%)_saturate(1979%)_hue-rotate(182deg)_brightness(92%)_contrast(93%)]"
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 text-sm font-medium leading-snug text-zinc-800">
                    {entry.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
