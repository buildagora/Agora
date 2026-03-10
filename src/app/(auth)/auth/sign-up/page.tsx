"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
// TODO: Replace getUserByEmail with API call
import { getEmailLabel, getEmailPlaceholder } from "@/lib/validators";

function SignUpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Pre-fill email if provided in query param
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsProcessing(true);

    if (!email.trim()) {
      setError("Email is required");
      setIsProcessing(false);
      return;
    }

    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address");
      setIsProcessing(false);
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsProcessing(false);
      return;
    }

    // TODO: Check if email already exists via API
    // For now, skip duplicate check to avoid build error

    // Route to role selection with email and password in query params
    const params = new URLSearchParams({
      email: email.trim().toLowerCase(),
      password: password, // In production, this should be hashed
    });
    router.push(`/auth/sign-up/role?${params.toString()}`);
  };

  const handleSSO = (provider: string) => {
    // Placeholder for SSO - in real app, this would initiate OAuth flow
    // SSO not yet implemented - silently fail or show toast if toast system is available
    console.log(`${provider} SSO is not yet implemented. Please use email sign up.`);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2 text-center">
              Create your account
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8 text-center">
              Enter your email and password to get started
            </p>

            {error && (
              <div className="mb-6 p-4 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/20">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mb-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                  {getEmailLabel()}
                </label>
                <input
                  type={process.env.NODE_ENV === "production" ? "email" : "text"}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder={getEmailPlaceholder()}
                  className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="mb-4">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Password"
                  className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                  required
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={isProcessing || !email.trim() || !password}
                className="w-full h-12 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Loading..." : "Continue"}
              </button>
            </form>

            <div className="text-center mb-6">
              <Link
                href="/auth/sign-in"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                Already have an account? Sign in
              </Link>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
              <span className="text-sm text-zinc-500 dark:text-zinc-500">OR</span>
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleSSO("Google")}
                className="w-full h-12 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium"
              >
                Continue with Google
              </button>
              <button
                onClick={() => handleSSO("Microsoft")}
                className="w-full h-12 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium"
              >
                Continue with Microsoft
              </button>
              <button
                onClick={() => handleSSO("Apple")}
                className="w-full h-12 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium"
              >
                Continue with Apple
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageInner />
    </Suspense>
  );
}
