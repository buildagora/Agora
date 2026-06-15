"use client";

import type { ReactNode } from "react";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function SiteHeader({
  drawerOpen = false,
  onDrawerOpenChange,
  trailing,
  showLogo = true,
  layout = "default",
}: {
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  trailing?: ReactNode;
  showLogo?: boolean;
  layout?: "default" | "searchHomeMobile";
}) {
  const isSearchHomeMobile = layout === "searchHomeMobile";
  const navClass = isSearchHomeMobile
    ? "sticky top-0 z-20 w-full shrink-0 border-b border-zinc-200 bg-white md:hidden"
    : "sticky top-0 z-20 w-full shrink-0 border-b border-zinc-200 bg-white";

  return (
    <nav className={navClass}>
      <div
        className={
          isSearchHomeMobile
            ? "flex h-14 items-center justify-between gap-3 px-4"
            : "flex h-16 items-center px-4 sm:px-6 lg:px-8"
        }
      >
        <div className={`flex min-w-0 items-center ${isSearchHomeMobile ? "gap-3" : "gap-4"}`}>
          {onDrawerOpenChange ? (
            <button
              type="button"
              onClick={() => onDrawerOpenChange(!drawerOpen)}
              className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-zinc-700 transition-colors hover:bg-zinc-100 md:hidden"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
            >
              <span className="flex flex-col gap-1.5" aria-hidden>
                <span className="block h-0.5 w-[22px] rounded-full bg-zinc-700" />
                <span className="block h-0.5 w-[22px] rounded-full bg-zinc-700" />
                <span className="block h-0.5 w-[22px] rounded-full bg-zinc-700" />
              </span>
            </button>
          ) : null}

          {showLogo ? <AgoraLogo variant="header" /> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </nav>
  );
}
