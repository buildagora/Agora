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
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
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
              <h1 className="text-2xl font-semibold text-black text-center">
                Supplier Access Is Invite-Only During Beta
              </h1>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-6 text-center">
                <p className="text-zinc-600">
                  Supplier accounts are currently created by invitation only so we can verify supplier identity and attach each account to the correct company profile.
                </p>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-left">
                  <p className="text-sm font-medium text-black mb-2">
                    How supplier onboarding works during beta
                  </p>
                  <ul className="text-sm text-zinc-600 space-y-2 list-disc pl-5">
                    <li>Buyers can still create accounts publicly.</li>
                    <li>Suppliers join Agora through an invite or claim link.</li>
                    <li>Our team can also onboard suppliers manually.</li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/auth/sign-in">
                    <Button variant="primary" size="lg">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/suppliers">
                    <Button variant="secondary" size="lg">
                      Back to Supplier Page
                    </Button>
                  </Link>
                </div>
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
