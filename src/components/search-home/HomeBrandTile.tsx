"use client";

import { useState } from "react";
import Image from "next/image";
import { resolveHomeBrandDisplay } from "@/lib/search/homeBrandDisplay";
import type { HomePopularBrand } from "@/lib/search/homeDiscovery";

export default function HomeBrandTile({
  brand,
  onSelect,
  disabled = false,
}: {
  brand: HomePopularBrand;
  onSelect: (query: string) => void;
  disabled?: boolean;
}) {
  const display = resolveHomeBrandDisplay(brand.logoLabel);
  const [logoFailed, setLogoFailed] = useState(false);

  const showLogo = display.logoSrc && !logoFailed;

  return (
    <li className="w-[120px] shrink-0 snap-start sm:w-[128px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(brand.query)}
        className="flex h-[80px] w-full items-center justify-center rounded-xl bg-white px-1.5 py-2 shadow-sm shadow-zinc-200/60 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-zinc-200/80 disabled:cursor-not-allowed disabled:opacity-50 sm:h-[84px] sm:px-2"
        aria-label={brand.label}
      >
        {showLogo ? (
          <Image
            src={display.logoSrc!}
            alt=""
            width={112}
            height={56}
            unoptimized
            className="max-h-12 w-auto max-w-[90%] object-contain sm:max-h-14"
            aria-hidden
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="line-clamp-2 px-1 text-center text-[11px] font-semibold leading-tight text-[#1E3A5F] sm:text-xs">
            {brand.label}
          </span>
        )}
      </button>
    </li>
  );
}
