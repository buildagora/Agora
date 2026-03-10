import { redirect } from "next/navigation";

/**
 * Signin route - Redirects to the actual sign-in page
 * This provides a cleaner /signin URL while maintaining the existing /auth/sign-in route
 * Preserves query parameters (returnTo, role, etc.)
 */
export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; next?: string; role?: string; [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  
  // Preserve returnTo (preferred) or next (legacy)
  // CRITICAL: Sanitize returnTo to prevent recursive redirects
  const rawReturnTo = params.returnTo || params.next;
  if (rawReturnTo) {
    const returnToValue = typeof rawReturnTo === "string" ? rawReturnTo : rawReturnTo[0];
    const { sanitizeReturnTo } = await import("@/lib/auth/routeIntent");
    const sanitized = sanitizeReturnTo(returnToValue);
    if (sanitized) {
      urlParams.set("returnTo", sanitized);
    }
  }
  
  // Preserve role if provided
  if (params.role) {
    urlParams.set("role", typeof params.role === "string" ? params.role : params.role[0]);
  }
  
  const queryString = urlParams.toString();
  const redirectUrl = queryString ? `/auth/sign-in?${queryString}` : "/auth/sign-in";
  
  redirect(redirectUrl);
}

