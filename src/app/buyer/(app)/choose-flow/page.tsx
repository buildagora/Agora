"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import Card, { CardContent } from "@/components/ui2/Card";

export default function ChooseFlowPage() {
  const router = useRouter();
  const { user } = useAuth(); // NEW FOUNDATION: Server is source of truth

  useEffect(() => {
    // NEW FOUNDATION: AuthGuard handles auth/role checks
    // This effect only loads data when user is authenticated and role matches
    if (!user || user.role !== "BUYER") {
      return; // AuthGuard will redirect
    }
    // Redirect to dashboard
    router.replace("/buyer/dashboard");
  }, [user, router]);

  return (
    <div className="flex flex-1 px-6 py-8">
        <div className="w-full max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-2">
              What are you trying to do?
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Choose the option that best matches your needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* FIND MATERIALS */}
            <Link href="/buyer/find">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="p-8 text-center">
                  <div className="text-4xl mb-4">🔍</div>
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">
                    Help me find materials
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                    Discover suppliers in your area. Browse local, retail, and wholesale options. No bidding required.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* PROCURE MATERIALS */}
            <Link href="/buyer/rfqs/new">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="p-8 text-center">
                  <div className="text-4xl mb-4">🧾</div>
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">
                    I know what I want — get pricing / place an order
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                    Create a request for quotes. Get bids from suppliers. Award and generate purchase orders.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className="text-center">
            <Link
              href="/buyer/dashboard"
              className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50 transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
  );
}

