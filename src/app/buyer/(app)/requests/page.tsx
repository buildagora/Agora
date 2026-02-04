"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Requests Index - Redirects to Sent (default view)
 */
export default function RequestsPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/buyer/requests/sent");
  }, [router]);

  return null;
}

