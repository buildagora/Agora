# Storefront static visuals

Self-hosted assets for supplier storefront cards. These are **not** product photos.

- `brands/` — Agora wordmark-style SVG tiles for the curated brand registry (typographic references, not scraped trademark artwork)
- `categories/` — abstract category icons (not SKU imagery)

Official manufacturer logos may replace wordmark tiles in a later PR after asset review.

## Phase 11.5A

- 29 brand wordmarks (9 original + 20 priority additions)
- 18 category icons with parent-category inheritance in `categoryVisualRegistry.ts`
- Fallback visuals live in `storefrontImageFallbacks.tsx` (monogram, category icon, product package, composed line)
