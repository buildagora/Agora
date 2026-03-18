"use client";

import { useRouter } from "next/navigation";

/**
 * useSafeBack - Safe browser back navigation with fallback
 * 
 * Prevents navigating back to sign-in or nowhere when:
 * - User opened link directly from email/new tab (no meaningful history)
 * - Referrer is from different origin (cross-origin navigation)
 * - History length is 1 (no previous page)
 * 
 * @param fallbackUrl - URL to navigate to if safe back is not possible
 * @returns Function to trigger safe back navigation
 */
export function useSafeBack(fallbackUrl: string) {
  const router = useRouter();

  const handleSafeBack = () => {
    // Check if we have meaningful history
    const hasHistory = typeof window !== "undefined" && window.history.length > 1;
    
    // Check referrer - if empty or different origin, use fallback
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const referrerOrigin = referrer ? new URL(referrer).origin : "";
    const isSameOrigin = referrer && referrerOrigin === currentOrigin;
    
    // If we have history AND same-origin referrer, use browser back
    if (hasHistory && isSameOrigin) {
      router.back();
    } else {
      // Otherwise, navigate to fallback URL
      router.replace(fallbackUrl);
    }
  };

  return handleSafeBack;
}




