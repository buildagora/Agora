import type { CapabilitySearchResult } from "@/lib/search/capabilitySearch";

export type SupplierSearchMode = "BROAD" | "REFINED" | "EXACT";

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSearchMode(
  requestText: string,
  capabilityMatches: CapabilitySearchResult[] = []
): SupplierSearchMode {
  const q = normalize(requestText);
  const terms = q.split(/\s+/).filter(Boolean);

  if (!q || terms.length <= 2) return "BROAD";

  let specificityScore = 0;

  if (terms.length >= 4) specificityScore += 1;
  if (terms.length >= 6) specificityScore += 1;

  if (/\b\d+\s?(ton|seer|seer2|sq|squares|bundle|bundles|ft|inch|in)\b/.test(q)) {
    specificityScore += 2;
  }

  if (/\b(black|charcoal|white|brown|gray|grey|red|green|blue|weathered|wood|shakewood|moire)\b/.test(q)) {
    specificityScore += 1;
  }

  if (/\b(hdz|landmark|timberline|carrier|trane|lennox|goodman|gaf|certainteed|owens|corning)\b/.test(q)) {
    specificityScore += 1;
  }

  const strongCapabilityMatch = capabilityMatches.some((m) => m.score >= 80);
  if (strongCapabilityMatch) specificityScore += 1;

  // Strong exact signal: contains BOTH brand + modifier (color/model/type)
  const hasBrand =
    /\b(hdz|landmark|timberline|carrier|trane|lennox|goodman|gaf|certainteed|owens|corning|oakridge)\b/i.test(
      q
    );
  const hasDescriptor =
    /\b(black|charcoal|white|brown|gray|grey|red|green|blue|weathered|wood|shakewood|moire|onyx)\b/i.test(
      q
    );

  if (hasBrand && hasDescriptor) return "EXACT";

  // fallback scoring
  if (specificityScore >= 4) return "EXACT";
  if (specificityScore >= 2) return "REFINED";
  return "BROAD";
}
