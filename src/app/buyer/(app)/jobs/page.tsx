"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Jobs/Projects - Redirects to Dashboard
 */
export default function JobsPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/buyer/dashboard");
  }, [router]);

  return null;
}

