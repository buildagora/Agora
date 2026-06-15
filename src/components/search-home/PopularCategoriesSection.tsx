"use client";

import { useState } from "react";
import { HOME_POPULAR_CATEGORIES } from "@/lib/search/homeDiscovery";
import AllCategoriesModal from "./AllCategoriesModal";
import HomeCategoryCard, { HomeSeeAllCategoriesCard } from "./HomeCategoryCard";
import HomeScrollRow from "./HomeScrollRow";

export default function PopularCategoriesSection({
  onSelect,
  disabled = false,
}: {
  onSelect: (query: string) => void;
  disabled?: boolean;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <>
      <HomeScrollRow title="Popular categories" className="mt-10 sm:mt-12">
        {HOME_POPULAR_CATEGORIES.map((category) => (
          <HomeCategoryCard
            key={category.id}
            category={category}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
        <HomeSeeAllCategoriesCard
          onOpen={() => setCatalogOpen(true)}
          disabled={disabled}
        />
      </HomeScrollRow>

      <AllCategoriesModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelectCategory={onSelect}
        disabled={disabled}
      />
    </>
  );
}
