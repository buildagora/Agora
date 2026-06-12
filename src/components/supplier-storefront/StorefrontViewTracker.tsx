"use client";

import { useEffect } from "react";
import { trackStorefrontViewed } from "@/lib/analytics/storefrontAnalytics";
import type { SupplierStorefrontView } from "@/lib/search/storefront/types";

export default function StorefrontViewTracker({
  view,
  requestId,
  supplierId,
}: {
  view: SupplierStorefrontView;
  requestId: string;
  supplierId: string;
}) {
  useEffect(() => {
    trackStorefrontViewed({
      requestId,
      supplierId,
      tier: view.tier,
      productCount: view.catalogMetrics.productCount,
      layoutMode: view.layoutMode,
      discoveryStatus: view.discoveryStatus,
    });
  }, [
    requestId,
    supplierId,
    view.catalogMetrics.productCount,
    view.discoveryStatus,
    view.layoutMode,
    view.tier,
  ]);

  return null;
}
