import type { StorefrontNavItem } from "@/lib/search/storefront/types";
import {
  buildNavItemRefinementHref,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import StorefrontNavCard from "./StorefrontNavCard";
import StorefrontSection from "./StorefrontSection";

export default function NavigationLinksSection({
  items,
  requestId,
  supplierId,
  urlParams,
}: {
  items: StorefrontNavItem[];
  requestId: string;
  supplierId: string;
  urlParams: StorefrontUrlParams;
}) {
  if (items.length === 0) return null;

  return (
    <StorefrontSection
      title="Related browse paths"
      description="Continue exploring this supplier in Agora."
    >
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
        {items.map((item) => (
          <StorefrontNavCard
            key={item.id}
            item={item}
            href={buildNavItemRefinementHref(requestId, supplierId, item, urlParams)}
          />
        ))}
      </div>
    </StorefrontSection>
  );
}
