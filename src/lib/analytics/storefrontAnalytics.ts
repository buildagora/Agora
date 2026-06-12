import { trackEvent, type AnalyticsProps } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { StorefrontTier } from "@/lib/search/storefront/types";

type StorefrontBaseProps = {
  requestId: string;
  supplierId: string;
  tier: StorefrontTier;
};

function baseProps(props: StorefrontBaseProps): AnalyticsProps {
  return {
    requestId: props.requestId,
    supplierId: props.supplierId,
    tier: props.tier,
  };
}

export function trackStorefrontViewed(
  props: StorefrontBaseProps & {
    productCount: number;
    layoutMode: string;
    discoveryStatus: string;
  }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_viewed, {
      ...baseProps(props),
      productCount: props.productCount,
      layoutMode: props.layoutMode,
      discoveryStatus: props.discoveryStatus,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontCategoryClicked(
  props: StorefrontBaseProps & { category: string }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_category_clicked, {
      ...baseProps(props),
      category: props.category,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontBrandClicked(
  props: StorefrontBaseProps & { brand: string }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_brand_clicked, {
      ...baseProps(props),
      brand: props.brand,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontFilterApplied(
  props: StorefrontBaseProps & { filterType: string; filterValue: string }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_filter_applied, {
      ...baseProps(props),
      filterType: props.filterType,
      filterValue: props.filterValue,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontProductCardViewed(
  props: StorefrontBaseProps & { productTitle: string; index: number }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_product_card_viewed, {
      ...baseProps(props),
      productTitle: props.productTitle,
      index: props.index,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontProductDetailViewed(
  props: StorefrontBaseProps & { productTitle: string }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_product_detail_viewed, {
      ...baseProps(props),
      productTitle: props.productTitle,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontCallClicked(props: StorefrontBaseProps): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_call_clicked, baseProps(props));
  } catch {
    // fail silently
  }
}

export function trackStorefrontDirectionsClicked(props: StorefrontBaseProps): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_directions_clicked, baseProps(props));
  } catch {
    // fail silently
  }
}

export function trackStorefrontWebsiteClicked(props: StorefrontBaseProps): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_website_clicked, baseProps(props));
  } catch {
    // fail silently
  }
}

export function trackStorefrontLoadMoreClicked(
  props: StorefrontBaseProps & { visibleCount: number; totalCount: number }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_load_more_clicked, {
      ...baseProps(props),
      visibleCount: props.visibleCount,
      totalCount: props.totalCount,
    });
  } catch {
    // fail silently
  }
}

export function trackStorefrontImageFallback(
  props: StorefrontBaseProps & {
    imageMode: string;
    imageSource: string | null;
    estimatedSourcePx: number | null;
  }
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.storefront_image_fallback, {
      ...baseProps(props),
      imageMode: props.imageMode,
      imageSource: props.imageSource,
      estimatedSourcePx: props.estimatedSourcePx,
    });
  } catch {
    // fail silently
  }
}
