"use client";

import { useEffect } from "react";

/**
 * Layout wrapper for supplier conversation page
 * Overrides the default main overflow to allow full-height conversation UI
 */
export default function SupplierConversationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Find the main element and make it overflow-hidden for full-height pages
    const main = document.querySelector("main");
    if (main) {
      main.classList.add("overflow-hidden");
      return () => {
        main.classList.remove("overflow-hidden");
      };
    }
  }, []);

  return <div className="h-full">{children}</div>;
}

