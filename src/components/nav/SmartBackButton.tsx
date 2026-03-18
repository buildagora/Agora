"use client";

import { useRouter } from "next/navigation";

interface SmartBackButtonProps {
  fallback?: string;
  label?: string;
  className?: string;
}

/**
 * SmartBackButton - Intelligently handles browser back navigation
 * 
 * Uses a robust heuristic to determine if browser back is safe:
 * - If window.history.length > 1 AND document.referrer starts with window.location.origin, use router.back()
 * - Otherwise, navigate to fallback URL (default "/seller/dashboard")
 * 
 * This prevents navigating back to sign-in or nowhere when users land directly from email links.
 */
export default function SmartBackButton({
  fallback = "/seller/dashboard",
  label = "← Back",
  className = "text-sm text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50 bg-transparent border-none cursor-pointer p-0",
}: SmartBackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    // Check if we have usable same-origin history
    const hasHistory = typeof window !== "undefined" && window.history.length > 1;
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const isSameOrigin = referrer && referrer.startsWith(currentOrigin);

    // If we have history AND same-origin referrer, use browser back
    if (hasHistory && isSameOrigin) {
      router.back();
    } else {
      // Otherwise, navigate to fallback
      router.push(fallback);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={className}
      type="button"
    >
      {label}
    </button>
  );
}




