"use client";

import Image from "next/image";
import { categoryIconSrc, type HomePopularCategory } from "@/lib/search/homeDiscovery";

const categoryCardClass =
  "flex h-full min-h-[118px] w-full flex-col items-center justify-center gap-2.5 rounded-xl bg-white px-3 py-4 text-center shadow-sm shadow-zinc-200/60 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-zinc-200/80 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[124px]";

const iconWellClass =
  "flex h-11 w-11 items-center justify-center rounded-lg bg-stone-50";

export default function HomeCategoryCard({
  category,
  onSelect,
  disabled = false,
}: {
  category: HomePopularCategory;
  onSelect: (query: string) => void;
  disabled?: boolean;
}) {
  return (
    <li className="w-[128px] shrink-0 snap-start sm:w-[136px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(category.query)}
        className={categoryCardClass}
      >
        <span className={iconWellClass}>
          <Image
            src={categoryIconSrc(category.iconSlug)}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain opacity-80 [filter:brightness(0)_saturate(100%)_invert(16%)_sepia(28%)_saturate(1979%)_hue-rotate(182deg)_brightness(92%)_contrast(93%)]"
            aria-hidden
          />
        </span>
        <span className="line-clamp-2 text-xs font-medium leading-snug text-zinc-800 sm:text-[13px]">
          {category.label}
        </span>
      </button>
    </li>
  );
}

export function HomeSeeAllCategoriesCard({
  onOpen,
  disabled = false,
}: {
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <li className="w-[128px] shrink-0 snap-start sm:w-[136px]">
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className={categoryCardClass}
        aria-label="See all categories"
      >
        <span className={iconWellClass}>
          <ArrowRightIcon className="h-5 w-5 text-[#1E3A5F]/75" />
        </span>
        <span className="text-xs font-medium leading-snug text-[#1E3A5F] sm:text-[13px]">
          See all categories
        </span>
      </button>
    </li>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
