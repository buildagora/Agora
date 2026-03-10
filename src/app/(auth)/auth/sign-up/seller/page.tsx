"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MATERIAL_CATEGORIES } from "@/lib/categoryDisplay";
import { labelToCategoryId } from "@/lib/categoryIds";
import { validateEmailOrTestId, getEmailLabel, getEmailPlaceholder } from "@/lib/validators";
import AppShell from "@/components/ui2/AppShell";
import Button from "@/components/ui2/Button";
import Card, { CardContent, CardHeader } from "@/components/ui2/Card";
import Input from "@/components/ui2/Input";

function SellerSignUpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    companyName: "",
    fullName: "",
    email: "",
    phone: "",
    businessAddress: "",
    password: "",
    agreedToTerms: false,
  });
  const [categoriesServed, setCategoriesServed] = useState<string[]>([]);
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

    // Validation: Company name is preferred, but fullName is acceptable if companyName is missing
    if (!formData.companyName.trim() && !formData.fullName.trim()) {
      newErrors.companyName = "Company name or full name is required";
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
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    if (categoriesServed.length === 0) {
      newErrors.categoriesServed = "Please select at least one category";
    }
    if (!formData.agreedToTerms) {
      newErrors.agreedToTerms = "You must agree to the End User Service Agreement";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }

    // Create user via API endpoint
    try {
      // Convert category labels to canonical categoryIds
      const categoryIds = categoriesServed
        .map((label) => labelToCategoryId[label as keyof typeof labelToCategoryId])
        .filter((id): id is NonNullable<typeof id> => id != null); // Filter out any undefined values

      // CANONICAL ENDPOINT: POST /api/auth/signup (create account)
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          role: "SELLER",
          categoryIds: categoryIds, // Canonical category IDs (e.g., "roofing", "hvac")
          categoriesServed: categoryIds, // Compatibility field (defensive)
          // Include companyName only if provided
          ...(formData.companyName.trim() && { companyName: formData.companyName.trim() }),
          // Include fullName only if provided
          ...(formData.fullName.trim() && { fullName: formData.fullName.trim() }),
          // Include phone only if provided
          ...(formData.phone.trim() && { phone: formData.phone.trim() }),
          // Include serviceArea only if provided
          ...(formData.businessAddress.trim() && { serviceArea: formData.businessAddress.trim() }),
          agreedToTerms: formData.agreedToTerms,
        }),
      });

      // Always capture status, contentType, and raw text first
      const status = response.status;
      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text(); // ALWAYS read text exactly once
      let parsed: any = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {}

      if (!response.ok) {
        console.error(`[SIGNUP_HTTP_FAILURE] url=/api/auth/signup status=${status} contentType=${contentType}`);
        console.error(`[SIGNUP_HTTP_FAILURE_BODY] ${rawText.slice(0, 1500)}`);
        console.error(`[SIGNUP_HTTP_FAILURE_JSON] ${JSON.stringify(parsed)}`);
        
        const errorMessage = parsed?.message || parsed?.error || `Signup failed (${status})`;
        setErrors({ 
          submit: errorMessage
        });
        setIsSubmitting(false);
        return;
      }

      // Verify response structure - MUST have ok: true and user
      if (parsed?.ok !== true || !parsed?.user) {
        console.error(`[SIGNUP_BAD_RESPONSE] status=${status} contentType=${contentType}`);
        console.error(`[SIGNUP_BAD_RESPONSE_BODY] ${rawText.slice(0, 1500)}`);
        console.error(`[SIGNUP_BAD_RESPONSE_JSON] ${JSON.stringify(parsed)}`);
        
        const errorMessage = parsed?.message || "Signup failed";
        setErrors({ 
          submit: errorMessage
        });
        setIsSubmitting(false);
        return;
      }

      const result = parsed;

      // Verify user has required fields
      if (!result.user.id || !result.user.email || !result.user.role) {
        console.error(`[SIGNUP_INVALID_USER_DATA] userId=${result.user?.id || "missing"} email=${result.user?.email || "missing"} role=${result.user?.role || "missing"}`);
        setErrors({ 
          submit: "Invalid user data from server. Please try again." 
        });
        setIsSubmitting(false);
        return;
      }
      
      // In dev mode, show stored email if it differs from input
      if (result.storedEmail && result.storedEmail !== formData.email.trim().toLowerCase()) {
        console.log(`[SIGNUP_DEV_EMAIL] original=${formData.email} stored=${result.storedEmail} note="Use stored email to sign in"`);
        // Show alert with stored email for easy copy/paste
        alert(`Account created!\n\nStored email: ${result.storedEmail}\n\nCopy this email to sign in.`);
      }
      
      // TASK 3: Success - signup completed and verified, redirect to sign-in
      // Pre-fill email in sign-in page for convenience
      const signInUrl = `/auth/sign-in?email=${encodeURIComponent(formData.email.trim().toLowerCase())}`;
      router.push(signInUrl);
    } catch (error) {
      setErrors({ 
        submit: "Failed to create account. Please try again." 
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
                Create Seller Account
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
                      label="Full Name (Optional)"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => handleChange("fullName", e.target.value)}
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
                    <Input
                      label="Business Address (Optional)"
                      type="text"
                      value={formData.businessAddress}
                      onChange={(e) => handleChange("businessAddress", e.target.value)}
                      placeholder="Street address, city, state, ZIP"
                    />
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">Categories You Serve *</h2>
                  <div className="border border-zinc-300 dark:border-zinc-700 rounded-lg p-4 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900">
                    <div className="flex flex-col gap-2">
                      {MATERIAL_CATEGORIES.map((category) => (
                        <label
                          key={category}
                          className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 p-2 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={categoriesServed.includes(category)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCategoriesServed((prev) => [...prev, category]);
                              } else {
                                setCategoriesServed((prev) =>
                                  prev.filter((c) => c !== category)
                                );
                              }
                              // Clear error when user selects a category
                              if (errors.categoriesServed) {
                                setErrors((prev) => {
                                  const newErrors = { ...prev };
                                  delete newErrors.categoriesServed;
                                  return newErrors;
                                });
                              }
                            }}
                            className="w-4 h-4 text-black border-zinc-300 dark:border-zinc-700 rounded focus:ring-black dark:focus:ring-zinc-50"
                          />
                          <span className="text-sm text-black dark:text-zinc-50">{category}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {errors.categoriesServed && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.categoriesServed}
                    </p>
                  )}
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
                  {isSubmitting ? "Creating Account..." : "Create Seller Account"}
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

export default function SellerSignUpPage() {
  return (
    <Suspense fallback={null}>
      <SellerSignUpPageInner />
    </Suspense>
  );
}
