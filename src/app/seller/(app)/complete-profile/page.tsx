"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { enforceRoleClient } from "@/lib/auth/requireRoleClient";
import { CATEGORY_OPTIONS, labelToCategoryId } from "@/lib/categoryDisplay";
import Header from "@/components/Header";

export default function SellerCompleteProfilePage() {
  const router = useRouter();
  const { user, status, refresh } = useAuth();
  const [categoriesServed, setCategoriesServed] = useState<string[]>([]); // Stores categoryIds, not labels
  const [companyName, setCompanyName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    // CRITICAL: Do not route to /auth/sign-in here; preserve deep link via role-specific login + returnTo (AuthGuard invariant).
    // If user is BUYER, redirect to buyer dashboard (never show seller setup to buyers)
    if (user?.role === "BUYER") {
      router.replace("/buyer/dashboard");
      return;
    }

    // Enforce SELLER role (routes to /seller/login if unauthenticated, or switch-role if wrong role)
    if (!enforceRoleClient({
      userRole: user?.role || null,
      requiredRole: "SELLER",
      routerReplace: router.replace,
    })) {
      return;
    }

    // If seller already has categoryIds (canonical ids), redirect to dashboard
    // CRITICAL: Check for categoryIds, not labels
    const hasCategoryIds = user.categoriesServed &&
      Array.isArray(user.categoriesServed) &&
      user.categoriesServed.length > 0 &&
      user.categoriesServed.every((cat: string) => 
        CATEGORY_OPTIONS.some(opt => opt.id === cat)
      );
    
    if (hasCategoryIds) {
      if (process.env.NODE_ENV === "development") {
        console.log("[SELLER_GATE]", {
          role: user.role,
          categoryIdsCount: user.categoriesServed?.length || 0,
          categoryIds: user.categoriesServed,
          reason: "HAS_CATEGORY_IDS",
        });
      }
      router.push("/seller/dashboard");
      return;
    }

    // Pre-fill existing categoryIds if any (should be empty array at this point)
    if (user.categoriesServed && Array.isArray(user.categoriesServed)) {
      // Filter to only valid categoryIds
      const validCategoryIds = user.categoriesServed.filter((cat: string) =>
        CATEGORY_OPTIONS.some(opt => opt.id === cat)
      );
      setCategoriesServed(validCategoryIds);
    }
    
    // Pre-fill companyName if it exists
    if (user.companyName) {
      setCompanyName(user.companyName);
    }
    
    // DEV-ONLY: Log gate render reason
    if (process.env.NODE_ENV === "development") {
      console.log("[SELLER_GATE]", {
        role: user.role,
        categoryIdsCount: user.categoriesServed?.length || 0,
        categoryIds: user.categoriesServed,
        reason: "SHOWING_GATE",
      });
    }
  }, [user, status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // CRITICAL: Validate companyName or fullName exists
    const hasDisplayName = companyName.trim() || user?.fullName?.trim();
    if (!hasDisplayName) {
      setError("Company name is required. Please enter your company name.");
      return;
    }

    if (categoriesServed.length === 0) {
      setError("Please select at least one category");
      return;
    }

    setIsSubmitting(true);

    // CRITICAL: Do not route to /auth/sign-in here; preserve deep link via role-specific login + returnTo (AuthGuard invariant).
    if (!enforceRoleClient({
      userRole: user?.role || null,
      requiredRole: "SELLER",
      routerReplace: router.replace,
    })) {
      setIsSubmitting(false);
      return;
    }

    // Update user categories and companyName via API endpoint
    try {
      const response = await fetch("/api/seller/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          categoriesServed,
          ...(companyName.trim() && { companyName: companyName.trim() }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || "Failed to save profile. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Success - refresh auth state and redirect
      // CRITICAL: Refetch /api/auth/me to get updated profile, then redirect
      await refresh(); // Refresh auth state
      router.refresh(); // Force Next.js to revalidate
      router.push("/seller/dashboard");
    } catch (error) {
      setError("Failed to save profile. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-2 text-center">
            Complete Your Profile
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-center">
            Select the categories you serve to receive matching RFQ notifications.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter your company name"
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                required
              />
              {error && error.includes("Company name") && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                Categories you serve *
              </label>
              <div className="border border-zinc-300 dark:border-zinc-700 rounded-lg p-4 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900">
                <div className="flex flex-col gap-2">
                  {CATEGORY_OPTIONS.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={categoriesServed.includes(category.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategoriesServed((prev) => [...prev, category.id]);
                          } else {
                            setCategoriesServed((prev) =>
                              prev.filter((c) => c !== category.id)
                            );
                          }
                          // Clear error when user selects a category
                          if (error) {
                            setError("");
                          }
                        }}
                        className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 rounded focus:ring-black dark:focus:ring-zinc-50"
                      />
                      <span className="text-sm text-black dark:text-zinc-50">{category.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-14 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : "Save Categories"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

