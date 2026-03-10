"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/clientFetch";

/**
 * Signup redirect page
 * 
 * This page handles legacy email links that point to /signup.
 * It routes users to the appropriate destination:
 * - If authenticated (SELLER): /seller/feed?from=email
 * - If not authenticated: /signin?next=/seller/feed?from=email
 * 
 * Preserves optional category and other query params from the original URL.
 */
function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Check authentication status
    const checkAuth = async () => {
      try {
        const response = await fetchJson("/api/auth/me", {
          credentials: "include",
        });

        // Type the JSON response
        const data = response.json as { ok: boolean; user?: { id: string; role: string; email: string } } | null;

        if (response.ok && data?.ok && data.user) {
          // User is authenticated
          const user = data.user;

          // Build destination URL with preserved query params
          const destinationParams = new URLSearchParams();
          destinationParams.set("from", "email");

          // Preserve category if present in original URL
          const category = searchParams.get("category");
          if (category) {
            destinationParams.set("category", category);
          }

          // Preserve other relevant params (rfqId, supplierId, etc.) - we don't use them but preserve for future
          const rfqId = searchParams.get("rfqId");
          if (rfqId) {
            destinationParams.set("rfqId", rfqId);
          }

          const destination = `/seller/feed?${destinationParams.toString()}`;

          // Redirect based on role
          if (user.role === "SELLER") {
            router.replace(destination);
          } else {
            // For non-sellers, redirect to their dashboard
            router.replace("/buyer/dashboard");
          }
        } else {
          // User is not authenticated - redirect to sign-in with next param
          const destinationParams = new URLSearchParams();
          destinationParams.set("from", "email");

          // Preserve category if present
          const category = searchParams.get("category");
          if (category) {
            destinationParams.set("category", category);
          }

          const destination = `/seller/feed?${destinationParams.toString()}`;
          const signInUrl = `/signin?returnTo=${encodeURIComponent(destination)}&role=seller`;

          router.replace(signInUrl);
        }
      } catch (error) {
        // On error, assume not authenticated and redirect to sign-in
        console.error("[SIGNUP_PAGE_AUTH_CHECK_ERROR]", error);
        const destination = "/seller/feed?from=email";
        router.replace(`/signin?returnTo=${encodeURIComponent(destination)}&role=seller`);
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
  }, [mounted, router, searchParams]);

  // Show loading state while checking auth
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  // This should rarely render as we redirect immediately
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-lg text-gray-600">Redirecting...</div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg text-gray-600">Loading...</div>
        </div>
      </div>
    }>
      <SignupPageInner />
    </Suspense>
  );
}

