/**
 * Capability search: product-line text is the strongest signal; brand/subcategory/category
 * matches provide fallback evidence when product lines are absent.
 */

import { getPrisma } from "@/lib/db.server";

export type CapabilitySearchResult = {
  supplierId: string;
  categoryId: string;
  subcategory: string;
  brand: string;
  productLine: string | null;
  sourceUrl: string;
  score: number;
};

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTerms(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
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
    meaningful.every((t) => fieldNorm.includes(normalizeText(t)))
  ) {
    return 3;
  }

  let hits = 0;
  for (const t of meaningful) {
    const tn = normalizeText(t);
    if (tn.length >= 2 && fieldNorm.includes(tn)) hits++;
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

export async function searchCapabilities(
  query: string
): Promise<CapabilitySearchResult[]> {
  const prisma = getPrisma();

  const normalizedQuery = normalizeText(query);
  const terms = meaningfulTerms(normalizedQuery);
  if (terms.length === 0) {
    return [];
  }
  const metalIntent = isMetalRoofingIntent(normalizedQuery);

  const matches = await prisma.supplierCapability.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { productLine: { contains: term, mode: "insensitive" as const } },
        { subcategory: { contains: term, mode: "insensitive" as const } },
        { brand: { contains: term, mode: "insensitive" as const } },
        { notes: { contains: term, mode: "insensitive" as const } },
        { categoryId: { contains: term, mode: "insensitive" as const } },
      ]),
    } as any,
    orderBy: { createdAt: "desc" },
  });

  // Keep both product-line rows AND broader capability rows.
  // Product-line matches remain strongest, but brand/subcategory/category rows
  // act as fallback evidence for suppliers that require manual verification.
  const capabilities = matches;

  const scored = capabilities.map((record) => {
    let score = 0;

    const categoryId = String((record as any).categoryId || "");
    const plNorm = normalizeText(String((record as any).productLine || ""));
    const hasProductLine = plNorm.length > 0;
    const subNorm = normalizeText(record.subcategory);
    const brandNorm = normalizeText(record.brand);
    const notesNorm = normalizeText(String((record as any).notes || ""));

    // 1) productLine — strongest signal (eligibility already guarantees non-empty productLine)
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
      const t = normalizeText(term);
      if (!t) continue;
      if (plNorm === t) {
        score += 22;
      } else if (plNorm.includes(t)) {
        score += 14;
      }
    }

    // 2) subcategory — second (e.g. Metal Roofing + productLine Corrugated Panels)
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
      const t = normalizeText(term);
      if (!t) continue;
      if (subNorm === t) {
        score += 14;
      } else if (subNorm.includes(t)) {
        score += 9;
      }
    }

    // 3) brand — third (weakened if no productLine)
    if (brandNorm === normalizedQuery) {
      score += hasProductLine ? 16 : 6;
    }

    for (const term of terms) {
      const t = normalizeText(term);
      if (!t) continue;

      if (brandNorm === t) {
        score += hasProductLine ? 12 : 4;
      } else if (brandNorm.includes(t)) {
        score += hasProductLine ? 5 : 2;
      }
    }

    // 4) notes — lightest
    if (notesNorm.length > 0) {
      if (
        normalizedQuery.length >= 5 &&
        notesNorm.includes(normalizedQuery)
      ) {
        score += 3;
      } else {
        let noteHits = 0;
        for (const term of terms) {
          const tn = normalizeText(term);
          if (tn.length >= 3 && notesNorm.includes(tn)) noteHits++;
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

  /** Supplier order follows first appearance in global rank (best row per supplier first). */
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
      normalizeText(String(r.brand ?? "")),
      normalizeText(
        String((r as { productLine?: string | null }).productLine ?? "")
      ),
      normalizeText(String(r.subcategory ?? "")),
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
