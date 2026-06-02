/**
 * Capability search: product-line text is the strongest signal; brand/subcategory/category
 * matches provide fallback evidence when product lines are absent.
 */

import { getPrisma } from "@/lib/db.server";
import {
  extractProductSearchTerms,
  fieldMatchesSearchTerm,
  isDimensionOrFractionToken,
  normalizeSearchText,
  toProductSearchQuery,
} from "./productSearchQuery";

export type CapabilitySearchResult = {
  supplierId: string;
  categoryId: string;
  subcategory: string;
  brand: string;
  productLine: string | null;
  sourceUrl: string;
  score: number;
};

/** Terms safe for Prisma `contains` (no short substring false positives). */
function dbLookupTerms(terms: string[]): string[] {
  const out = new Set<string>();
  for (const term of terms) {
    const t = term.trim().toLowerCase();
    if (!t) continue;
    if (isDimensionOrFractionToken(t) || t.length >= 4 || t.includes(" ")) {
      out.add(t);
    }
  }
  return [...out];
}

function termMatchesField(fieldNorm: string, term: string): boolean {
  return fieldMatchesSearchTerm(fieldNorm, term);
}

/** True when the query is about metal roofing, metal panels, or common metal-roof accessories/tools. */
function isMetalRoofingIntent(normalizedQuery: string): boolean {
  const n = normalizedQuery;
  if (!n) return false;

  const phrases = [
    "metal roofing",
    "metal roof",
    "metal panels",
    "metal panel",
    "standing seam",
    "corrugated",
    "metal trim",
    "flashing",
    "roofing screws",
    "roofing fasteners",
    "roofing fastener",
    "butyl tape",
    "pipe boots",
    "pipe boot",
    "solar seal",
    "malco",
    "roof sealant",
    "metal roofing tools",
    "corrugated panels",
  ];

  if (phrases.some((p) => n.includes(p))) return true;

  if (n.includes("sealant") && (n.includes("roof") || n.includes("metal")))
    return true;

  if (/\bmetal\b/.test(n) && /\b(roof|roofing|panel|panels|trim)\b/.test(n))
    return true;

  if (n.includes("screw") && n.includes("roof")) return true;
  if (n.includes("fastener") && /\b(roof|roofing)\b/.test(n)) return true;

  if (n.includes("butyl") && n.includes("tape")) return true;
  if (n.includes("pipe") && n.includes("boot")) return true;

  if (/\bmalco\b/.test(n)) return true;

  return false;
}

const DEDICATED_METAL_SUPPLIER_BOOST: Record<string, number> = {
  summertown_metals_tn: 48,
  quality_metal_hsv: 34,
  metaltek_hsv: 34,
  discount_metal_hsv: 34,
};

const BROAD_ROOFING_DISTRIBUTORS = new Set([
  "abc_supply_hsv",
  "gulfeagle_hsv",
  "srs_hsv",
  "cmn90dbjr000404ldzhcsquav",
  "lansing_hsv",
]);

/** Higher = better tie-break (field alignment with query). */
function fieldMatchRank(
  fieldNorm: string,
  normalizedQuery: string,
  terms: string[]
): number {
  if (!fieldNorm) return 0;

  if (fieldNorm === normalizedQuery) return 5;
  if (
    normalizedQuery.length >= 4 &&
    fieldNorm.includes(normalizedQuery)
  ) {
    return 4;
  }
  if (fieldNorm.length >= 4 && normalizedQuery.includes(fieldNorm)) return 4;

  const meaningful = terms.filter((t) => t.length >= 2);
  if (
    meaningful.length > 0 &&
    meaningful.every((t) => termMatchesField(fieldNorm, t))
  ) {
    return 3;
  }

  let hits = 0;
  for (const t of meaningful) {
    if (termMatchesField(fieldNorm, t)) hits++;
  }
  if (hits >= 2) return 2;
  if (hits === 1) return 1;
  return 0;
}

function compareCandidates(
  a: {
    score: number;
    productLineRank: number;
    subcategoryRank: number;
    createdAt?: Date;
  },
  b: {
    score: number;
    productLineRank: number;
    subcategoryRank: number;
    createdAt?: Date;
  }
): number {
  if (a.score !== b.score) return b.score - a.score;

  if (a.productLineRank !== b.productLineRank)
    return b.productLineRank - a.productLineRank;

  if (a.subcategoryRank !== b.subcategoryRank)
    return b.subcategoryRank - a.subcategoryRank;

  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bTime - aTime;
}

function recordMatchesProductIntent(
  fields: {
    plNorm: string;
    subNorm: string;
    brandNorm: string;
    notesNorm: string;
    categoryNorm: string;
  },
  terms: string[],
  normalizedQuery: string
): boolean {
  if (terms.length === 0) return false;

  const allFields = [
    fields.plNorm,
    fields.subNorm,
    fields.brandNorm,
    fields.notesNorm,
    fields.categoryNorm,
  ];

  if (
    normalizedQuery.length >= 4 &&
    allFields.some((f) => f.includes(normalizedQuery))
  ) {
    return true;
  }

  return terms.some((term) =>
    allFields.some((f) => termMatchesField(f, term))
  );
}

export async function searchCapabilities(
  query: string,
  options?: { originalQuery?: string }
): Promise<CapabilitySearchResult[]> {
  const prisma = getPrisma();

  const productPhrase = toProductSearchQuery(query) || query.trim();
  const normalizedQuery = normalizeSearchText(productPhrase);
  const terms = extractProductSearchTerms(query, {
    originalQuery: options?.originalQuery,
  });
  const lookupTerms = dbLookupTerms(terms);

  if (lookupTerms.length === 0 && !normalizedQuery) {
    return [];
  }

  const metalIntent = isMetalRoofingIntent(normalizedQuery);

  const whereTerms = lookupTerms.length > 0 ? lookupTerms : normalizedQuery ? [normalizedQuery] : [];

  const matches = await prisma.supplierCapability.findMany({
    where: {
      OR: whereTerms.flatMap((term) => [
        { productLine: { contains: term, mode: "insensitive" as const } },
        { subcategory: { contains: term, mode: "insensitive" as const } },
        { brand: { contains: term, mode: "insensitive" as const } },
        { notes: { contains: term, mode: "insensitive" as const } },
        { categoryId: { contains: term, mode: "insensitive" as const } },
      ]),
    } as any,
    orderBy: { createdAt: "desc" },
  });

  const capabilities = matches.filter((record) => {
    const plNorm = normalizeSearchText(String((record as any).productLine || ""));
    const subNorm = normalizeSearchText(record.subcategory);
    const brandNorm = normalizeSearchText(record.brand);
    const notesNorm = normalizeSearchText(String((record as any).notes || ""));
    const categoryNorm = normalizeSearchText(String((record as any).categoryId || ""));

    return recordMatchesProductIntent(
      { plNorm, subNorm, brandNorm, notesNorm, categoryNorm },
      terms.length > 0 ? terms : whereTerms,
      normalizedQuery
    );
  });

  const scored = capabilities.map((record) => {
    let score = 0;

    const categoryId = String((record as any).categoryId || "");
    const plNorm = normalizeSearchText(String((record as any).productLine || ""));
    const hasProductLine = plNorm.length > 0;
    const subNorm = normalizeSearchText(record.subcategory);
    const brandNorm = normalizeSearchText(record.brand);
    const notesNorm = normalizeSearchText(String((record as any).notes || ""));

    if (plNorm === normalizedQuery) {
      score += 42;
    } else if (
      normalizedQuery.length >= 4 &&
      plNorm.includes(normalizedQuery)
    ) {
      score += 36;
    } else if (plNorm.length >= 4 && normalizedQuery.includes(plNorm)) {
      score += 32;
    }

    for (const term of terms) {
      if (!term) continue;
      if (plNorm === term) {
        score += 22;
      } else if (termMatchesField(plNorm, term)) {
        score += 14;
      }
    }

    if (subNorm === normalizedQuery) {
      score += 26;
    } else if (
      normalizedQuery.length >= 4 &&
      subNorm.includes(normalizedQuery)
    ) {
      score += 20;
    } else if (subNorm.length >= 4 && normalizedQuery.includes(subNorm)) {
      score += 18;
    }

    for (const term of terms) {
      if (!term) continue;
      if (subNorm === term) {
        score += 14;
      } else if (termMatchesField(subNorm, term)) {
        score += 9;
      }
    }

    if (brandNorm === normalizedQuery) {
      score += hasProductLine ? 16 : 6;
    }

    for (const term of terms) {
      if (!term) continue;

      if (brandNorm === term) {
        score += hasProductLine ? 12 : 4;
      } else if (termMatchesField(brandNorm, term)) {
        score += hasProductLine ? 5 : 2;
      }
    }

    if (notesNorm.length > 0) {
      if (
        normalizedQuery.length >= 5 &&
        notesNorm.includes(normalizedQuery)
      ) {
        score += 3;
      } else {
        let noteHits = 0;
        for (const term of terms) {
          if (termMatchesField(notesNorm, term)) noteHits++;
        }
        score += Math.min(noteHits, 2);
      }
    }

    if (metalIntent) {
      const metalBoost = DEDICATED_METAL_SUPPLIER_BOOST[record.supplierId];
      if (metalBoost != null) {
        score += metalBoost;
      }
      if (BROAD_ROOFING_DISTRIBUTORS.has(record.supplierId)) {
        score -= 24;
      }
    }

    const productLineRank = fieldMatchRank(plNorm, normalizedQuery, terms);
    const subcategoryRank = fieldMatchRank(subNorm, normalizedQuery, terms);

    return {
      ...record,
      categoryId,
      score,
      productLineRank,
      subcategoryRank,
    };
  });

  const ranked = scored
    .filter((r) => r.score >= 5)
    .sort((a, b) => compareCandidates(a, b));

  const rowsBySupplier = new Map<string, (typeof scored)[number][]>();
  for (const r of ranked) {
    const list = rowsBySupplier.get(r.supplierId) ?? [];
    list.push(r);
    rowsBySupplier.set(r.supplierId, list);
  }

  const supplierOrder: string[] = [];
  const seenSupplierOrder = new Set<string>();
  for (const r of ranked) {
    if (!seenSupplierOrder.has(r.supplierId)) {
      seenSupplierOrder.add(r.supplierId);
      supplierOrder.push(r.supplierId);
    }
  }

  const MAX_ROWS_PER_SUPPLIER = 4;

  function rowUniquenessKey(r: (typeof scored)[number]): string {
    return [
      normalizeSearchText(String(r.brand ?? "")),
      normalizeSearchText(
        String((r as { productLine?: string | null }).productLine ?? "")
      ),
      normalizeSearchText(String(r.subcategory ?? "")),
    ].join("\u0001");
  }

  const flattened: (typeof scored)[number][] = [];
  for (const supplierId of supplierOrder) {
    const supplierRows = rowsBySupplier.get(supplierId) ?? [];
    const seenKey = new Set<string>();
    let kept = 0;
    for (const r of supplierRows) {
      if (kept >= MAX_ROWS_PER_SUPPLIER) break;
      const key = rowUniquenessKey(r);
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      flattened.push(r);
      kept++;
    }
  }

  return flattened.map((r) => ({
    supplierId: r.supplierId,
    categoryId: r.categoryId,
    subcategory: r.subcategory,
    brand: r.brand,
    productLine: (() => {
      const s = String(
        (r as { productLine?: string | null }).productLine ?? ""
      ).trim();
      return s.length > 0 ? s : null;
    })(),
    sourceUrl: r.sourceUrl,
    score: r.score,
  }));
}
