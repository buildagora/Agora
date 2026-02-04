"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Jobs/Projects - Redirects to Agent (where threads live)
 */
export default function JobsPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/buyer/agent");
  }, [router]);

  return null;
}

