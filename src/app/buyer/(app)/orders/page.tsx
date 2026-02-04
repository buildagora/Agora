"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Orders Index - Redirects to Open (default view)
 */
export default function OrdersPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/buyer/orders/open");
  }, [router]);

  return null;
}
