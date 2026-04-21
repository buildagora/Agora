"use client";

import AgoraLogo from "@/components/brand/AgoraLogo";

export default function SiteHeader({
  drawerOpen = false,
  onDrawerOpenChange,
}: {
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}) {
  return (
    <nav className="sticky top-0 z-20 w-full shrink-0 border-b border-zinc-200 bg-white">
      <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onDrawerOpenChange?.(!drawerOpen)}
            className="inline-flex shrink-0 items-center justify-center rounded-md p-2.5 text-zinc-700 transition-colors hover:bg-zinc-100"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
          >
            <span className="flex flex-col gap-1.5" aria-hidden>
              <span className="block h-0.5 w-[22px] rounded-full bg-zinc-700" />
              <span className="block h-0.5 w-[22px] rounded-full bg-zinc-700" />
              <span className="block h-0.5 w-[22px] rounded-full bg-zinc-700" />
            </span>
          </button>

          <AgoraLogo variant="header" />
        </div>
      </div>
    </nav>
  );
}
