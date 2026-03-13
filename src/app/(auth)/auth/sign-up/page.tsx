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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [passwordMismatchError, setPasswordMismatchError] = useState("");
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

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsProcessing(false);
      return;
    }

    if (!confirmPassword) {
      setError("Please confirm your password");
      setIsProcessing(false);
      return;
    }

    if (password !== confirmPassword) {
      setPasswordMismatchError("Passwords do not match");
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
                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPassword(value);
                      setError("");
                      // Real-time validation: show error if passwords don't match and both fields have values
                      if (confirmPassword && value && value !== confirmPassword) {
                        setPasswordMismatchError("Passwords do not match");
                      } else {
                        setPasswordMismatchError("");
                      }
                    }}
                    placeholder="Password"
                    className="w-full px-4 py-3 pr-12 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-zinc-50"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0A9.97 9.97 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.736m0 0L21 21M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      const value = e.target.value;
                      setConfirmPassword(value);
                      setError("");
                      // Real-time validation: show error if passwords don't match and both fields have values
                      if (value && password && value !== password) {
                        setPasswordMismatchError("Passwords do not match");
                      } else {
                        setPasswordMismatchError("");
                      }
                    }}
                    onBlur={(e) => {
                      // Validate on blur as well
                      if (e.target.value && password && e.target.value !== password) {
                        setPasswordMismatchError("Passwords do not match");
                      }
                    }}
                    placeholder="Confirm password"
                    className={`w-full px-4 py-3 pr-12 border rounded-lg bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 ${
                      passwordMismatchError
                        ? "border-red-300 dark:border-red-700 focus:ring-red-500"
                        : "border-zinc-300 dark:border-zinc-700 focus:ring-black dark:focus:ring-zinc-50"
                    }`}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 focus:outline-none"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0A9.97 9.97 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.736m0 0L21 21M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {passwordMismatchError && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{passwordMismatchError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isProcessing || !email.trim() || !password || !confirmPassword || password !== confirmPassword}
                className="w-full h-12 rounded-lg bg-black text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Loading..." : "Continue"}
              </button>
            </form>

            <div className="text-center mt-6">
              <Link
                href="/auth/sign-in"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                Already have an account? Sign in
              </Link>
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
