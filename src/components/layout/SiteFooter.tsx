import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-auto w-full shrink-0 overflow-x-hidden bg-white pt-2">
      <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-6 text-center text-xs leading-relaxed text-zinc-500 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-8 sm:gap-y-0 sm:text-[13px]">
          <p className="sm:justify-self-start sm:text-left">
            Serving Huntsville &amp; North Alabama
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:gap-x-3">
            <Link href="/how-it-works" className="text-inherit transition hover:opacity-70">
              How It Works
            </Link>
            <span className="select-none text-zinc-300" aria-hidden>|</span>
            <Link href="/contact" className="text-inherit transition hover:opacity-70">
              Contact Us
            </Link>
            <span className="select-none text-zinc-300" aria-hidden>|</span>
            <Link href="/legal/terms" className="text-inherit transition hover:opacity-70">
              Privacy Policy
            </Link>
          </p>
          <p className="sm:justify-self-end sm:text-right">© 2024 Agora</p>
        </div>
      </div>
    </footer>
  );
}
