import {
  hasRealBrandLogo,
  lookupBrandLogo,
} from "@/lib/search/storefront/brandLogoRegistry";

export type HomeBrandDisplay = {
  slug: string | null;
  logoSrc: string | null;
};

export function resolveHomeBrandDisplay(label: string): HomeBrandDisplay {
  const resolved = lookupBrandLogo(label);
  if (!resolved) {
    return { slug: null, logoSrc: null };
  }
  return {
    slug: resolved.slug,
    logoSrc: hasRealBrandLogo(resolved.slug) ? resolved.src : null,
  };
}
