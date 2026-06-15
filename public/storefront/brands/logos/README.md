# Homepage brand logos

Real brand marks for the Agora homepage **Popular Brands & Products** row live alongside storefront assets under `/storefront/brands/`.

- Raster logos use the slug from `brandLogoRegistry.ts` (e.g. `gaf.png`, `daltile.jpg`).
- Register new files in `BRAND_LOGO_FILES` inside `brandLogoRegistry.ts`.
- Homepage resolves via `resolveHomeBrandDisplay()` → `hasRealBrandLogo()` + `brandLogoAssetSrc()`.
- Legacy `.svg` wordmark placeholders remain for unmapped brands only.

Official trademark artwork should be sourced deliberately (press kits / licensed assets).
