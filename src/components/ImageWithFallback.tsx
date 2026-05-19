"use client";

import { useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  /**
   * Tailwind classes — applied to both the <img> and the fallback container,
   * so the layout doesn't shift on error (same height/width either way).
   */
  className?: string;
  /**
   * Optional custom fallback node. Defaults to a neutral image-placeholder
   * SVG icon. Use this to render initials for supplier logos, etc.
   */
  fallback?: React.ReactNode;
  /**
   * Tailwind classes for the fallback container only. If omitted, falls
   * back to a soft zinc tint that reads as "image placeholder".
   */
  fallbackContainerClassName?: string;
};

const DEFAULT_FALLBACK_CONTAINER =
  "flex items-center justify-center bg-zinc-100 text-zinc-400";

/**
 * Drop-in replacement for `<img>` that handles three flavors of "no image":
 *   1. `src` is null / undefined / empty string  → fallback container
 *   2. `src` set but image fails to load (404, CORS, etc.) → fallback container
 *   3. `src` set and loads → real image
 *
 * The fallback container takes the same className as the would-be image so
 * the layout doesn't shift. Lazy-loaded by default.
 */
export default function ImageWithFallback({
  src,
  alt,
  className,
  fallback,
  fallbackContainerClassName,
}: Props) {
  const [broken, setBroken] = useState(false);

  const showFallback = !src || broken;
  if (showFallback) {
    return (
      <div
        className={`${fallbackContainerClassName ?? DEFAULT_FALLBACK_CONTAINER} ${className ?? ""}`}
        aria-label={alt || undefined}
        role="img"
      >
        {fallback ?? <DefaultImagePlaceholder />}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? undefined}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

function DefaultImagePlaceholder() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-1/3 w-1/3 min-h-[24px] min-w-[24px] max-h-12 max-w-12"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
