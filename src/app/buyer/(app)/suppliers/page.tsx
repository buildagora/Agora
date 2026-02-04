"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Suppliers Index - Redirects to Preferred (default view)
 */
export default function SuppliersPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/buyer/suppliers/preferred");
  }, [router]);

  return null;
}

