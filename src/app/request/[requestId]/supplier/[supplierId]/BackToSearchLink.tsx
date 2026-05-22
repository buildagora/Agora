import Link from "next/link";

/**
 * "← Back to search" link rendered above the supplier hero. Shown only when
 * the supplier detail page was reached from the chat-driven search results
 * (the URL carries fromThread + fromSearch query params). Both the streaming
 * shell and the resolved DeepSupplierDetail render this, so it stays
 * visible across the Suspense boundary swap.
 */
export default function BackToSearchLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 sm:text-[15px]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to search
    </Link>
  );
}

export function buildSearchBackHref(
  thread: string | undefined | null,
  search: string | undefined | null
): string | null {
  if (!thread || !search) return null;
  return `/search/${encodeURIComponent(thread)}/${encodeURIComponent(search)}`;
}
