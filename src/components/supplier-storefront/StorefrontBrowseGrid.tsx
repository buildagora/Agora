"use client";

import { buildCapabilityBrowseItems } from "@/lib/search/storefront/buildCapabilityBrowseItems";
import type { StorefrontUrlParams } from "@/lib/search/storefront/storefrontNavigation";
import type { SupplierStorefrontView } from "@/lib/search/storefront/types";
import StorefrontBrowseTile from "./StorefrontBrowseTile";
import {
  STOREFRONT_SECTION_DESC,
  STOREFRONT_SECTION_TITLE,
} from "./storefrontUiTokens";

export default function StorefrontBrowseGrid({
  view,
  requestId,
  supplierId,
  urlParams,
  title = "Browse this supplier",
  description = "Select a brand or category to explore what this supplier likely carries.",
}: {
  view: SupplierStorefrontView;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  title?: string;
  description?: string;
}) {
  const items = buildCapabilityBrowseItems(view, urlParams);

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-4">
        <h2 className={STOREFRONT_SECTION_TITLE}>{title}</h2>
        <p className={STOREFRONT_SECTION_DESC}>{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <StorefrontBrowseTile
            key={item.id}
            item={item}
            requestId={requestId}
            supplierId={supplierId}
            urlParams={urlParams}
            tier={view.tier}
          />
        ))}
      </div>
    </section>
  );
}
