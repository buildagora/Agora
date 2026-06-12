import type { StorefrontNavItem } from "@/lib/search/storefront/types";
import {
  buildNavItemRefinementHref,
  type StorefrontUrlParams,
} from "@/lib/search/storefront/storefrontNavigation";
import StorefrontNavCard from "./StorefrontNavCard";
import StorefrontSection from "./StorefrontSection";

export default function CategorySection({
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
      title="Shop by category"
      description="Narrow your search within this supplier's catalog."
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
