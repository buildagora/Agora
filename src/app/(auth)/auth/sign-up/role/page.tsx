"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Card, { CardContent } from "@/components/ui2/Card";
import { trackEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

function SignUpRoleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleRoleSelect = (role: "buyer" | "seller") => {
    trackEvent(ANALYTICS_EVENTS.signup_role_selected, { role });

    // Get email and password from query params
    const email = searchParams.get("email");
    const password = searchParams.get("password");

    if (!email || !password) {
      // If missing params, redirect back to sign-up
      router.push("/auth/sign-up");
      return;
    }

    // Route to role-specific signup form with email and password
    const params = new URLSearchParams({
      email,
      password,
    });
    router.push(`/auth/sign-up/${role}?${params.toString()}`);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-black mb-2">
            Create your account
          </h1>
          <p className="text-lg text-zinc-600">
            Are you a buyer or a seller?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleRoleSelect("buyer")}>
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">🏗️</div>
              <h2 className="text-xl font-semibold text-black mb-2">
                I&apos;m a Buyer
              </h2>
              <p className="text-sm text-zinc-600">
                Request materials and get competitive quotes from suppliers
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleRoleSelect("seller")}>
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">🏪</div>
              <h2 className="text-xl font-semibold text-black mb-2">
                I&apos;m a Seller
              </h2>
              <p className="text-sm text-zinc-600">
                Submit bids and win orders from buyers in your area
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Link
            href="/auth/sign-in"
            className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignUpRolePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><p className="text-zinc-600">Loading...</p></div>}>
      <SignUpRoleInner />
    </Suspense>
  );
}

