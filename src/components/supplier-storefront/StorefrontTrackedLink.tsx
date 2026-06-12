"use client";

import Link from "next/link";
import {
  trackStorefrontCallClicked,
  trackStorefrontDirectionsClicked,
  trackStorefrontWebsiteClicked,
} from "@/lib/analytics/storefrontAnalytics";
import type { StorefrontTier } from "@/lib/search/storefront/types";

export default function StorefrontTrackedLink({
  href,
  requestId,
  supplierId,
  tier,
  kind,
  className,
  children,
  target,
  rel,
}: {
  href: string;
  requestId: string;
  supplierId: string;
  tier: StorefrontTier;
  kind: "call" | "directions" | "website";
  className?: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}) {
  const onClick = () => {
    const base = { requestId, supplierId, tier };
    if (kind === "call") trackStorefrontCallClicked(base);
    else if (kind === "directions") trackStorefrontDirectionsClicked(base);
    else trackStorefrontWebsiteClicked(base);
  };

  if (href.startsWith("tel:") || href.startsWith("http")) {
    return (
      <a href={href} className={className} onClick={onClick} target={target} rel={rel}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
