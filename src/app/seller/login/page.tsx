"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import AgoraLogo from "@/components/brand/AgoraLogo";
import { sanitizeReturnTo } from "@/lib/auth/routeIntent";

/**
 * Seller Login Page (Client Component)
 * 
 * CRITICAL: This is a client component that renders instantly (no server-side redirect).
 * Prevents infinite compiling/redirect loops during logout.
 * 
 * This page is used when route intent is SELLER and user is unauthenticated.
 * It provides a simple UI that navigates to /auth/sign-in with the correct role.
 */
function SellerLoginPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Get returnTo from search params (preferred) or next (legacy)
  const rawReturnTo = searchParams.get("returnTo") || searchParams.get("next") || "";

  // CRITICAL: Sanitize returnTo to prevent recursive redirects
  const returnTo = useMemo(() => sanitizeReturnTo(rawReturnTo), [rawReturnTo]);

  // Mark as mounted after first paint
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-navigate after first paint (optional - doesn't block rendering)
  useEffect(() => {
    if (!mounted) return;
    
    // Small delay to ensure page renders first
    const timer = setTimeout(() => {
      const urlParams = new URLSearchParams();
      urlParams.set("role", "seller");
      if (returnTo) {
        urlParams.set("returnTo", returnTo);
      }
      router.replace(`/auth/sign-in?${urlParams.toString()}`);
    }, 100);

    return () => clearTimeout(timer);
  }, [mounted, returnTo, router]);

  const handleContinue = () => {
    const urlParams = new URLSearchParams();
    urlParams.set("role", "seller");
    if (returnTo) {
      urlParams.set("returnTo", returnTo);
    }
    router.replace(`/auth/sign-in?${urlParams.toString()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <AgoraLogo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign in as Seller
          </h2>
        </div>

        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Continue to sign in to your seller account.
            </p>
            <Button
              onClick={handleContinue}
              className="w-full"
              variant="primary"
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SellerLoginPage() {
  return (
    <Suspense fallback={null}>
      <SellerLoginPageInner />
    </Suspense>
  );
}