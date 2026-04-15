import AgoraLogo from "@/components/brand/AgoraLogo";

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <nav className="w-full border-b border-zinc-200 bg-white">
        <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
          <AgoraLogo variant="header" />
        </div>
      </nav>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <header className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Contact Us
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-zinc-500 sm:text-lg">
              Have questions or want to connect? Reach out directly.
            </p>
          </header>

          <div className="mt-12 rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-sm sm:p-10">
            <div className="space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Email
                </p>
                <a
                  href="mailto:buildagora@gmail.com"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#1E3A5F] px-5 py-3.5 text-center text-base font-medium text-white shadow-sm transition hover:bg-[#162d4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F] sm:w-auto"
                >
                  buildagora@gmail.com
                </a>
              </div>

              <div className="h-px bg-zinc-100" aria-hidden />

              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Name
                  </p>
                  <p className="mt-2 text-base font-medium text-zinc-900">
                    Michael Smith
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Location
                  </p>
                  <p className="mt-2 text-base font-medium text-zinc-900">
                    Huntsville, AL
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
