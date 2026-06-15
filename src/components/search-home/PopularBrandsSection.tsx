"use client";

import { HOME_POPULAR_BRANDS } from "@/lib/search/homeDiscovery";
import HomeBrandTile from "./HomeBrandTile";
import HomeScrollRow from "./HomeScrollRow";

export default function PopularBrandsSection({
  onSelect,
  disabled = false,
}: {
  onSelect: (query: string) => void;
  disabled?: boolean;
}) {
  return (
    <HomeScrollRow title="Popular Brands & Products" className="mt-8 sm:mt-10">
      {HOME_POPULAR_BRANDS.map((brand) => (
        <HomeBrandTile
          key={brand.id}
          brand={brand}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </HomeScrollRow>
  );
}
