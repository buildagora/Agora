"use client";

import Link from "next/link";
import {
  trackStorefrontBrandClicked,
  trackStorefrontCategoryClicked,
} from "@/lib/analytics/storefrontAnalytics";
import {
  buildNavItemRefinementHref,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import type { StorefrontBrowseItem } from "@/lib/search/storefront/buildCapabilityBrowseItems";
import type { StorefrontTier } from "@/lib/search/storefront/types";
import StorefrontImage from "./StorefrontImage";
import {
  STOREFRONT_ACTION_LINK,
  STOREFRONT_BADGE_CAPABILITY,
  STOREFRONT_CARD,
} from "./storefrontUiTokens";

export default function StorefrontBrowseTile({
  item,
  requestId,
  supplierId,
  urlParams,
  tier,
}: {
  item: StorefrontBrowseItem;
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
  tier: StorefrontTier;
}) {
  const inner = (
    <>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50">
        <StorefrontImage
          slot={item.imageSlot}
          label={item.label}
          variant={item.kind === "product_line" ? "composed" : "full"}
          composeBrand={item.composeBrand}
          composeCategory={item.composeCategory}
          className="h-10 w-10 object-contain"
        />
      </div>
      <div className="mt-3 min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-900">
          {item.label}
        </h3>
        {item.sublabel ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{item.sublabel}</p>
        ) : null}
        <span className={`${STOREFRONT_BADGE_CAPABILITY} mt-2`}>
          {item.kind === "product_line" ? "Likely carries" : "Browse"}
        </span>
        <p className={`${STOREFRONT_ACTION_LINK} text-xs`}>{item.actionLabel} →</p>
      </div>
    </>
  );

  if (item.kind === "brand" && item.navItem) {
    return (
      <Link
        href={buildNavItemRefinementHref(
          requestId,
          supplierId,
          item.navItem,
          urlParams
        )}
        onClick={() =>
          trackStorefrontBrandClicked({
            requestId,
            supplierId,
            tier,
            brand: item.label,
          })
        }
        className={`${STOREFRONT_CARD} flex flex-col p-4 no-underline`}
      >
        {inner}
      </Link>
    );
  }

  if (item.kind === "category" && item.navItem) {
    return (
      <Link
        href={buildNavItemRefinementHref(
          requestId,
          supplierId,
          item.navItem,
          urlParams
        )}
        onClick={() =>
          trackStorefrontCategoryClicked({
            requestId,
            supplierId,
            tier,
            category: item.label,
          })
        }
        className={`${STOREFRONT_CARD} flex flex-col p-4 no-underline`}
      >
        {inner}
      </Link>
    );
  }

  if (item.actionHref) {
    return (
      <a
        href={item.actionHref}
        target={item.actionExternal ? "_blank" : undefined}
        rel={item.actionExternal ? "noopener noreferrer" : undefined}
        className={`${STOREFRONT_CARD} flex flex-col p-4 no-underline`}
      >
        {inner}
      </a>
    );
  }

  return (
    <article className={`${STOREFRONT_CARD} flex flex-col p-4`}>{inner}</article>
  );
}
