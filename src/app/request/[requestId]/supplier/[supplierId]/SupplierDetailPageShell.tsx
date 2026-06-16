import type { ReactNode } from "react";
import SiteFooter from "@/components/layout/SiteFooter";
import SiteHeader from "@/components/layout/SiteHeader";

/** Persistent public chrome for supplier detail (loading, fallback, and resolved). */
export default function SupplierDetailPageShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader homeReplace />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
