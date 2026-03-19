"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { validateEmailOrTestId, getEmailLabel, getEmailPlaceholder } from "@/lib/validators";
import AppShell from "@/components/ui2/AppShell";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Input from "@/components/ui2/Input";
import { trackEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

function BuyerSignUpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    companyName: "",
    fullName: "",
    email: "",
    phone: "",
    password: "",
    agreedToTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Pre-fill email and password from query params
    const emailParam = searchParams.get("email");
    const passwordParam = searchParams.get("password");
    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
    if (passwordParam) {
      setFormData((prev) => ({ ...prev, password: passwordParam }));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const newErrors: Record<string, string> = {};

    // Validation
    if (!formData.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    }
    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    }
    
    // Validate email or test ID
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else {
      const emailValidation = validateEmailOrTestId(formData.email);
      if (!emailValidation.ok) {
        newErrors.email = emailValidation.message || "Invalid email or test ID";
      } else {
        // TODO: Check if email/test ID already exists via API
        // For now, skip duplicate check to avoid build error
      }
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone is required";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    if (!formData.agreedToTerms) {
      newErrors.agreedToTerms = "You must agree to the End User Service Agreement";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }

    // CANONICAL ENDPOINT: POST /api/auth/signup (create account)
    try {
      trackEvent(ANALYTICS_EVENTS.signup_submitted, {
        role: "buyer",
        method: "email_password",
      });

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          fullName: formData.fullName.trim(),
          companyName: formData.companyName.trim(),
          phone: formData.phone.trim(),
          role: "BUYER",
          agreedToTerms: formData.agreedToTerms,
        }),
      });

      if (!response.ok) {
        // A) Read status, headers, and raw text first
        const status = response.status;
        const contentType = response.headers.get("content-type") || "";
        let rawText = "";
        try {
          rawText = await response.text();
        } catch (textError) {
          rawText = `[Failed to read response text: ${textError}]`;
        }
        
        // A) Safely parse JSON
        let errorData: any = null;
        try {
          if (rawText && rawText.trim()) {
            errorData = JSON.parse(rawText);
          }
        } catch (parseError: any) {
          errorData = null;
        }
        
        // A) Log detailed failure info (dev-only) - use simple string logging to avoid serialization issues
        if (process.env.NODE_ENV !== "production") {
          console.error("[SIGNUP_HTTP_FAILURE]", {
            url: "/api/auth/signup",
            status,
            contentType,
            rawTextLength: rawText.length,
            rawTextSnippet: rawText.slice(0, 400),
            hasParsedData: errorData !== null && typeof errorData === "object",
            parsedData: errorData,
            parseError: errorData === null ? "Failed to parse JSON" : null,
          });
        }
        
        // A) Use parsed data if available, otherwise show generic error
        if (errorData === null || (typeof errorData === "object" && Object.keys(errorData).length === 0)) {
          console.error("[SIGNUP_ERROR_RESPONSE] Failed to parse JSON response or empty object", {
            status: status || "unknown",
            contentType: contentType || "unknown",
            rawTextLength: rawText?.length || 0,
            rawTextSnippet: rawText?.slice(0, 200) || "[empty]",
            errorDataIsNull: errorData === null,
            errorDataIsEmpty: errorData !== null && typeof errorData === "object" && Object.keys(errorData).length === 0,
            errorDataType: typeof errorData,
          });
          setErrors({ 
            submit: `Server error (${status}). Please try again.` 
          });
          setIsSubmitting(false);
          return;
        }
        
        // A) Log errorData (exactly as parsed, not {} fallback) - use simple object
        if (process.env.NODE_ENV !== "production") {
          console.error("[SIGNUP_ERROR_RESPONSE]", {
            error: errorData?.error,
            message: errorData?.message,
            ok: errorData?.ok,
            hasDiagnostics: !!errorData?.diagnostics,
            diagnostics: errorData?.diagnostics,
            fullErrorData: errorData,
          });
        }
        
        // TASK 5: Print diagnostics when email_exists in dev
        if (errorData.error === "email_exists") {
          if (errorData.diagnostics) {
            console.error("[SIGNUP_EMAIL_EXISTS]", {
              dbFingerprint: errorData.diagnostics.dbFingerprint,
              existingUserId: errorData.diagnostics.existingUserId,
              email: formData.email.trim().toLowerCase(),
            });
          } else {
            console.error("[SIGNUP_EMAIL_EXISTS] Missing diagnostics!", {
              errorData,
              email: formData.email.trim().toLowerCase(),
            });
          }
        }
        
        setErrors({ 
          submit: errorData.message || errorData.error || `Failed to create account (${status}). Please try again.` 
        });
        setIsSubmitting(false);
        return;
      }

      // TASK 3: Verify response structure - MUST have ok: true and user
      const result = await response.json();
      
      if (!result || result.ok !== true || !result.user) {
        console.error("[SIGNUP_INVALID_RESPONSE]", {
          ok: result?.ok,
          hasUser: !!result?.user,
          result,
        });
        setErrors({ 
          submit: "Invalid response from server. Please try again." 
        });
        setIsSubmitting(false);
        return;
      }

      // TASK 3: Verify user has required fields
      if (!result.user.id || !result.user.email || !result.user.role) {
        console.error("[SIGNUP_INVALID_USER_DATA]", {
          userId: result.user?.id,
          email: result.user?.email,
          role: result.user?.role,
        });
        setErrors({ 
          submit: "Invalid user data from server. Please try again." 
        });
        setIsSubmitting(false);
        return;
      }
      
      // In dev mode, show stored email if it differs from input
      if (result.storedEmail && result.storedEmail !== formData.email.trim().toLowerCase()) {
        console.log("[SIGNUP_DEV_EMAIL]", {
          original: formData.email,
          stored: result.storedEmail,
          note: "Use stored email to sign in",
        });
        // Show alert with stored email for easy copy/paste
        alert(`Account created!\n\nStored email: ${result.storedEmail}\n\nCopy this email to sign in.`);
      }
      
      // TASK 3: Success - signup completed and verified, redirect to sign-in
      // Pre-fill email in sign-in page for convenience
      const signInUrl = `/auth/sign-in?email=${encodeURIComponent(formData.email.trim().toLowerCase())}`;
      router.push(signInUrl);
    } catch (error) {
      setErrors({ 
        submit: error instanceof Error ? error.message : "Failed to create account. Please try again." 
      });
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <AppShell role={undefined}>
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 text-center">
                Create Buyer Account
              </h1>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div>
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">Account Information</h2>
                  <div className="space-y-4">
                    <Input
                      label="Company Name *"
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => handleChange("companyName", e.target.value)}
                      required
                      error={errors.companyName}
                    />
                    <Input
                      label="Full Name *"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => handleChange("fullName", e.target.value)}
                      required
                      error={errors.fullName}
                    />
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">Contact Details</h2>
                  <div className="space-y-4">
                    <Input
                      label={`${getEmailLabel()} *`}
                      type={process.env.NODE_ENV === "production" ? "email" : "text"}
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder={getEmailPlaceholder()}
                      required
                      disabled={!!searchParams.get("email")}
                      error={errors.email}
                    />
                    <Input
                      label="Phone *"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      required
                      error={errors.phone}
                    />
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">Security</h2>
                  <Input
                    label="Password *"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    required
                    disabled={!!searchParams.get("password")}
                    error={errors.password}
                  />
                </div>

                {errors.submit && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {errors.submit}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.agreedToTerms}
                      onChange={(e) => handleChange("agreedToTerms", e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-slate-600 focus:ring-2 focus:ring-slate-600 dark:focus:ring-slate-400"
                      required
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      I agree to the{" "}
                      <Link
                        href="/legal/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Agora End User Service Agreement
                      </Link>
                      {" "}and acknowledge that the platform is currently in beta.
                    </span>
                  </label>
                  {errors.agreedToTerms && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {errors.agreedToTerms}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isSubmitting || !formData.agreedToTerms}
                  className="w-full"
                >
                  {isSubmitting ? "Creating Account..." : "Create Buyer Account"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/auth/sign-in"
                  className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                >
                  Already have an account? Sign In
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export default function BuyerSignUpPage() {
  return (
    <Suspense fallback={null}>
      <BuyerSignUpPageInner />
    </Suspense>
  );
}
