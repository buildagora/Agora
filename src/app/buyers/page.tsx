"use client";

import Link from "next/link";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function BuyersPage() {
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
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
              Transform the Way You Source Materials with Agora
            </h1>
            <p className="text-xl sm:text-2xl text-zinc-600 dark:text-zinc-400 mb-8">
              Simplify and speed up your material procurement process—whether you need something fast from one supplier or want the best deal through competitive bidding.
            </p>
            
            <div className="space-y-4 text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <p>
                As a contractor, you know the drill: call multiple suppliers, wait for callbacks from outside sales reps, juggle quotes across spreadsheets, and hope you're getting the best price. It's time-consuming, inefficient, and leaves money on the table.
              </p>
              <p>
                Agora brings all your suppliers into one platform. Contact them instantly via "Talk to Suppliers," create orders directly, or broadcast your needs to every supplier in a category and let them compete for your business.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Sections */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1: Direct Orders */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                    Direct Orders to a Supplier
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                    Send an order directly to a trusted supplier you know and work with regularly. Perfect for repeat orders, urgent needs, or when you already have a preferred supplier.
                  </p>
                  <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <li className="flex items-start">
                      <span className="mr-2">⚡</span>
                      <span>Instant contact—no waiting for callbacks</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">✓</span>
                      <span>Simple, straightforward ordering</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">🔄</span>
                      <span>Quick repeat orders with trusted partners</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Feature 2: Broadcast RFQs */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                    Broadcast RFQs (Reverse Auctions)
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                    Broadcast your material request to all suppliers in a category. They submit competitive bids in a reverse auction format, giving you the power to choose the best overall quote.
                  </p>
                  
                  {/* Reverse Auction Callout */}
                  <div className="mt-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                      Reverse Auction Explained
                    </h3>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      We broadcast your material request to all relevant suppliers. They submit competitive bids in a reverse auction—prices can go down as suppliers compete. You pick the best overall quote (price + availability + delivery).
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Feature 3: Supplier Directory */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                    All Your Suppliers in One Place
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                    Soon, Agora will have a comprehensive directory of suppliers in every category. If you need something, you can find it on Agora—no more endless calls, no more hunting for suppliers.
                  </p>
                  <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <li className="flex items-start">
                      <span className="mr-2">📋</span>
                      <span>Comprehensive supplier directory (coming soon)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">💬</span>
                      <span>Instant contact via "Talk to Suppliers"</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">🚫</span>
                      <span>No more endless phone calls</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-zinc-900 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white dark:text-zinc-50 mb-4">
              Ready to Simplify Your Sourcing?
            </h2>
            <p className="text-xl text-zinc-300 dark:text-zinc-400 mb-8">
              Join Agora and connect with suppliers instantly. Upgrade your procurement game today.
            </p>
            <Link href="/auth/sign-up/buyer">
              <Button variant="primary" size="lg">
                Get Started
              </Button>
            </Link>
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
