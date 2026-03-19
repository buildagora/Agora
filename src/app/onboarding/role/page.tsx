"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getCurrentPathWithSearch } from "@/lib/auth/requireRoleClient";
import Header from "@/components/Header";

export default function RoleOnboardingPage() {
  const router = useRouter();
  const { user, status } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "loading") return;

    // If not authenticated, redirect to sign in with returnTo preserved
    if (!user) {
      const returnTo = getCurrentPathWithSearch();
      const encodedReturnTo = encodeURIComponent(returnTo);
      router.push(`/auth/sign-in?next=${encodedReturnTo}`);
      return;
    }

    // If user already has a role, redirect to their dashboard
    if (user.role === "BUYER" || user.role === "SELLER") {
      if (user.role === "BUYER") {
        router.push("/buyer/dashboard");
      } else {
        router.push("/seller/dashboard");
      }
      return;
    }
  }, [user, status, router]);

  const handleRoleSelect = async (role: "BUYER" | "SELLER") => {
    if (!user) return;

    // TODO: Update user role via API endpoint
    // For now, redirect to appropriate dashboard
    // The server should handle role assignment
    if (role === "BUYER") {
      router.push("/buyer/dashboard");
    } else {
      router.push("/seller/dashboard");
    }
  };

  if (!mounted || status === "loading" || !user) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <Header />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold text-black mb-6 text-center">
            Choose Your Role
          </h1>
          <p className="text-sm text-zinc-600 mb-8 text-center">
            Select how you&apos;ll use Agora
          </p>

          <div className="flex flex-col gap-4">
            <button
              onClick={() => handleRoleSelect("BUYER")}
              className="flex h-14 items-center justify-center rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 text-lg font-medium"
            >
              I&apos;m a Buyer
            </button>
            <button
              onClick={() => handleRoleSelect("SELLER")}
              className="flex h-14 items-center justify-center rounded-lg border-2 border-black text-black transition-colors hover:bg-zinc-100 text-lg font-medium"
            >
              I&apos;m a Seller
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

