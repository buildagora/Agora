"use client";

import Link from "next/link";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Navigation */}
      <nav className="relative z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <AgoraLogo variant="auth" />
            <Link href="/auth/sign-in">
              <Button variant="outline" size="md">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
              Building the Operating System for Construction Materials
            </h1>
            <p className="text-xl sm:text-2xl text-zinc-600 dark:text-zinc-400 mb-8">
              Agora unifies the fragmented materials supply chain into one connected network—so every order can find the best supplier, price, and fulfillment path.
            </p>
            
            <div className="space-y-4 text-lg text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <p>
                Construction materials are still sourced the hard way—calls, texts, emails, spreadsheets, and waiting on callbacks. The industry is massive, but the workflow is fragmented.
              </p>
              <p>
                Agora is building shared infrastructure: one place where contractors, suppliers, and logistics connect in real time. As the network grows, every material order—direct purchases, quoted requests, and competitive bids—can route through a single system.
              </p>
            </div>
          </div>
        </section>

        {/* What Agora becomes at scale */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-12 text-center">
              What Agora becomes at scale
            </h2>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    Unified Network
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Every supplier, every category—organized, searchable, and reachable instantly.
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    Real-Time Market
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Live pricing, availability signals, and competitive quoting—without the phone tag.
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    Trusted Infrastructure
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Identity, permissions, messaging, audit trails, and order history in one system.
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    Scale & Automation
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Routing, recommendations, and workflows that get smarter as the network grows.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Ending fragmentation → unlocking innovation */}
        <section className="bg-zinc-900/30 dark:bg-zinc-800/30 border-y border-zinc-800 dark:border-zinc-700 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-12 text-center">
              Ending fragmentation → unlocking innovation
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    End Fragmentation
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Replace scattered sourcing with a single workflow.
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    Drive Innovation
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Standardize data + communication so new tools can be built on top.
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                    Build Trust & Value
                  </h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    A fair market where speed, service, reliability, and price all matter.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Closing Line */}
        <section className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <p className="text-xl sm:text-2xl text-center text-zinc-700 dark:text-zinc-300 leading-relaxed">
              We&apos;re building more than a marketplace—we&apos;re building the backbone for how the industry sources materials.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <Link href="/" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
              ← Back to Home
            </Link>
            <div className="text-sm text-zinc-500 dark:text-zinc-500">
              © {new Date().getFullYear()} Agora. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
