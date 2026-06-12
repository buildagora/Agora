import Link from "next/link";
import type { ReactNode } from "react";

export const BIG_BOX_SUPPLIER_PREFIXES = ["home_depot", "lowes"];

export function isBigBoxSupplier(supplierId: string): boolean {
  return BIG_BOX_SUPPLIER_PREFIXES.some((p) => supplierId.startsWith(p));
}

export function bigBoxLabelForSupplier(supplierId: string): string | null {
  if (supplierId.startsWith("home_depot")) return "Home Depot";
  if (supplierId.startsWith("lowes")) return "Lowe's";
  return null;
}

export function InternalStorefrontLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
