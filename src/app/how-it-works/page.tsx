import AgoraLogo from "@/components/brand/AgoraLogo";
import Card, { CardContent } from "@/components/ui2/Card";

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <nav className="w-full border-b border-zinc-200 bg-white">
        <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
          <AgoraLogo variant="header" />
        </div>
      </nav>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <header className="mb-14 text-center sm:mb-16">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              How Agora Works
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-500 sm:text-lg">
              Agora replaces endless calling with one request and structured
              answers—so you can compare pricing and availability and keep jobs
              moving.
            </p>
          </header>

          <section className="mb-16 sm:mb-20" aria-labelledby="how-steps-heading">
            <h2 id="how-steps-heading" className="sr-only">
              Steps
            </h2>
            <ol className="grid gap-6 sm:gap-8">
              <li>
                <Card className="overflow-hidden border-zinc-200/90 shadow-sm">
                  <CardContent className="p-6 sm:p-8">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#1E3A5F]">
                      Step 1
                    </p>
                    <h3 className="mb-3 text-xl font-semibold text-zinc-900 sm:text-2xl">
                      Search for what you need
                    </h3>
                    <p className="leading-relaxed text-zinc-600">
                      Search or enter what you need—materials, quantities, and
                      timing—in one request.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="overflow-hidden border-zinc-200/90 shadow-sm">
                  <CardContent className="p-6 sm:p-8">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#1E3A5F]">
                      Step 2
                    </p>
                    <h3 className="mb-3 text-xl font-semibold text-zinc-900 sm:text-2xl">
                      Suppliers respond
                    </h3>
                    <p className="leading-relaxed text-zinc-600">
                      Multiple suppliers return pricing and availability so you
                      can compare without chasing callbacks.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="overflow-hidden border-zinc-200/90 shadow-sm">
                  <CardContent className="p-6 sm:p-8">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#1E3A5F]">
                      Step 3
                    </p>
                    <h3 className="mb-3 text-xl font-semibold text-zinc-900 sm:text-2xl">
                      Move forward faster
                    </h3>
                    <p className="leading-relaxed text-zinc-600">
                      Pick the best option and keep the job moving—less phone
                      tag, fewer wasted trips.
                    </p>
                  </CardContent>
                </Card>
              </li>
            </ol>
          </section>

          <section className="mb-16 sm:mb-20">
            <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Why Contractors Use Agora
            </h2>
            <Card className="border-zinc-200/90 shadow-sm">
              <CardContent className="p-8 sm:p-10">
                <p className="mb-8 text-base leading-relaxed text-zinc-600 sm:text-lg">
                  Agora replaces endless calling with one request and structured
                  answers built for how crews actually buy materials. Contractors
                  can search or enter what they need in one request. Multiple
                  suppliers respond so they can compare pricing and availability.
                  They can move forward faster without chasing callbacks, wasting
                  trips, or juggling spreadsheets. Agora helps crews know
                  what&apos;s in stock before they drive, reach more suppliers
                  with a single request, and make faster decisions to keep jobs
                  moving.
                </p>
                <ul className="space-y-4 border-t border-zinc-100 pt-8">
                  <li className="flex gap-3 text-zinc-800">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                      aria-hidden
                    />
                    <span className="leading-relaxed">
                      Stop wasting hours calling suppliers
                    </span>
                  </li>
                  <li className="flex gap-3 text-zinc-800">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                      aria-hidden
                    />
                    <span className="leading-relaxed">
                      Get competitive pricing from multiple suppliers
                    </span>
                  </li>
                  <li className="flex gap-3 text-zinc-800">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                      aria-hidden
                    />
                    <span className="leading-relaxed">
                      Know what&apos;s in stock before you drive
                    </span>
                  </li>
                  <li className="flex gap-3 text-zinc-800">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                      aria-hidden
                    />
                    <span className="leading-relaxed">
                      Reach more suppliers with a single request
                    </span>
                  </li>
                  <li className="flex gap-3 text-zinc-800">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                      aria-hidden
                    />
                    <span className="leading-relaxed">
                      Make faster decisions and keep jobs moving
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              The Old Way vs. Agora
            </h2>
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <Card className="h-full border-zinc-200/90 bg-zinc-50/80 shadow-sm">
                <CardContent className="p-6 sm:p-8">
                  <h3 className="mb-6 text-lg font-semibold text-zinc-900">
                    The Old Way
                  </h3>
                  <ul className="space-y-4 text-zinc-700">
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400"
                        aria-hidden
                      />
                      <span>Call 3–5 suppliers</span>
                    </li>
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400"
                        aria-hidden
                      />
                      <span>Wait around for callbacks</span>
                    </li>
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400"
                        aria-hidden
                      />
                      <span>Inconsistent pricing</span>
                    </li>
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400"
                        aria-hidden
                      />
                      <span>Drive around just to check stock</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="h-full border-zinc-200/90 bg-white shadow-sm">
                <CardContent className="p-6 sm:p-8">
                  <h3 className="mb-6 text-lg font-semibold text-zinc-900">
                    Agora
                  </h3>
                  <ul className="space-y-4 text-zinc-700">
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                        aria-hidden
                      />
                      <span>Send one request</span>
                    </li>
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                        aria-hidden
                      />
                      <span>Multiple suppliers respond</span>
                    </li>
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                        aria-hidden
                      />
                      <span>Pricing &amp; availability upfront</span>
                    </li>
                    <li className="flex gap-3">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E3A5F]"
                        aria-hidden
                      />
                      <span>Decide without the back-and-forth</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
