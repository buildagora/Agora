"use client";

import Link from "next/link";
import AgoraLogo from "@/components/brand/AgoraLogo";
import Button from "@/components/ui2/Button";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Navigation */}
      <nav className="relative z-50 w-full border-b border-zinc-200 bg-white">
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
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-2">
            AGORA END USER SERVICE AGREEMENT (BETA)
          </h1>
          <p className="text-sm text-zinc-600 mb-12">
            Effective Date: January 1, 2026
          </p>

          <div className="prose prose-zinc max-w-none space-y-6 text-zinc-700 leading-relaxed">
            <p>
              Welcome to Agora.
            </p>
            <p>
              This End User Service Agreement (&quot;Agreement&quot;) governs your access to and use of the Agora platform (&quot;Agora,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an account or using the platform, you agree to be bound by this Agreement.
            </p>
            <p className="font-semibold">
              If you do not agree, do not use the platform.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                1. Beta Disclosure
              </h2>
              <p>
                Agora is currently offered as a beta version. Features may be incomplete, unavailable, unstable, or subject to change without notice.
              </p>
              <p>
                You acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>The platform is provided for evaluation and commercial testing purposes.</li>
                <li>Functionality may change.</li>
                <li>Data loss, service interruptions, or errors may occur.</li>
                <li>No service levels or uptime guarantees are provided during beta.</li>
              </ul>
              <p>
                Use of the beta platform is at your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                2. Nature of the Platform
              </h2>
              <p>
                Agora is a technology platform that facilitates communication and transactions between buyers and suppliers of construction materials.
              </p>
              <p>
                Agora:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Is not a supplier.</li>
                <li>Is not a buyer.</li>
                <li>Does not manufacture, warehouse, or deliver materials.</li>
                <li>Does not guarantee pricing, availability, or fulfillment.</li>
                <li>Is not a party to transactions between users.</li>
              </ul>
              <p>
                All agreements are strictly between buyer and supplier.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                3. No Warranty
              </h2>
              <p className="font-semibold">
                THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot;
              </p>
              <p>
                Agora disclaims all warranties including merchantability, fitness for purpose, and accuracy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                4. Limitation of Liability
              </h2>
              <p>
                Agora shall not be liable for lost profits, delays, or indirect damages.
              </p>
              <p>
                Total liability shall not exceed $100 or fees paid in the prior 3 months.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                5. User Responsibilities
              </h2>
              <p>
                Users must provide accurate information and are responsible for verifying pricing, inventory, fulfillment, and contracts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                6. Transactions
              </h2>
              <p>
                Agora does not guarantee payment or fulfillment and is not escrow.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                7. Data &amp; Communications
              </h2>
              <p>
                Users grant Agora license to store transaction data and use anonymized analytics.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                8. Suspension
              </h2>
              <p>
                Agora may suspend accounts at its discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                9. Intellectual Property
              </h2>
              <p>
                All platform IP belongs to Agora.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                10. Modifications
              </h2>
              <p>
                This Agreement may be updated at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                11. Governing Law
              </h2>
              <p>
                This Agreement is governed by the laws of the State of Alabama.
              </p>
              <p>
                Venue shall be Madison County, Alabama.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-zinc-900 mt-8 mb-4">
                12. Contact
              </h2>
              <p>
                For questions regarding this Agreement, contact:
              </p>
              <p className="font-semibold">
                buildagora@gmail.com
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-zinc-200">
            <Link
              href="/"
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}



