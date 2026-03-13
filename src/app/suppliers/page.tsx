"use client";

import Link from "next/link";
import Button from "@/components/ui2/Button";
import Card, { CardContent } from "@/components/ui2/Card";
import AgoraLogo from "@/components/brand/AgoraLogo";

export default function SuppliersPage() {
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
              Unlock Your Sales Potential with Agora
            </h1>
            <p className="text-xl sm:text-2xl text-zinc-600 dark:text-zinc-400 mb-8">
              Expand your reach and win more customers by competing on value, not just the lowest price.
            </p>
            
            <div className="space-y-4 text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <p>
                As a supplier, you know the daily grind: fielding calls, texts, and emails all day long. Checking stock availability, calculating pricing on the fly, and responding to quote requests—only to find out many buyers aren't serious or are just tire-kicking. Hours wasted on dead-end leads that never convert.
              </p>
              <p>
                Agora changes the game. Get discovered by contractors actively looking for materials. Receive qualified leads and direct orders. Bid on opportunities where it makes sense. And communicate with buyers through a single messaging thread instead of endless back-and-forth calls.
              </p>
            </div>
          </div>
        </section>

        {/* Value Sections */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {/* Value 1: Access New Business */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                    Access New Business
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Get visibility to contractors actively sourcing materials. Receive direct orders and requests to bid on opportunities. Expand your reach beyond your existing network. Get qualified leads who are ready to buy, and bid when it pays to compete.
                  </p>
                </CardContent>
              </Card>

              {/* Value 2: Win on Service */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                    Win on Service, Not Just Price
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Differentiate yourself with availability, delivery speed, flexible terms, clear communication, and reliability. Stop racing to the bottom on price alone. Show buyers why you're the better choice—even if you're not the cheapest.
                  </p>
                </CardContent>
              </Card>

              {/* Value 3: Message Buyers Directly */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                    Message Buyers Directly
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Replace back-and-forth phone calls with a single messaging thread. Answer questions faster, provide updates instantly, and close deals quicker. Faster communication means faster closes and happier customers.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="bg-zinc-900/30 dark:bg-zinc-800/30 border-y border-zinc-800 dark:border-zinc-700 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 text-center mb-12">
              How It Works
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-orange-400/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-orange-400">1</span>
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                  Get Discovered
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Contractors find you through Agora's platform when they need materials in your category.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-orange-400/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-orange-400">2</span>
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                  Quote or Accept Direct Orders
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Receive direct orders from trusted buyers or submit competitive bids on broadcast requests.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-orange-400/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-orange-400">3</span>
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                  Convert Faster with Messaging
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Communicate with buyers in one place. Answer questions, provide updates, and close deals faster.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-zinc-900 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white dark:text-zinc-50 mb-4">
              Ready to Grow Your Business?
            </h2>
            <p className="text-xl text-zinc-300 dark:text-zinc-400 mb-8">
              Join Agora and connect with contractors who are actively sourcing materials. Stop wasting time on tire-kickers and start winning more qualified orders.
            </p>
            <div className="flex flex-col items-center gap-3">
              <Button variant="primary" size="lg" disabled>
                Supplier Access Is Invite-Only During Beta
              </Button>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Supplier accounts are currently created by invitation only.
              </p>
            </div>
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
