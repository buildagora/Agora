import { getPrisma } from "@/lib/db.server";

export type CapabilitySearchResult = {
  supplierId: string;
  categoryId: string;
  subcategory: string;
  brand: string;
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

const METAL_STRONG_TERMS = [
  "screw",
  "fastener",
  "seam",
  "corrugated",
  "trim",
  "flashing",
  "butyl",
  "boot",
  "malco",
  "sealant",
  "panel",
  "metal",
  "tape",
  "pipe",
  "solar",
];

function strongestProductTerm(
  normalizedQuery: string,
  terms: string[],
  metalIntent: boolean
): string {
  if (metalIntent) {
    const hit = METAL_STRONG_TERMS.find((t) => normalizedQuery.includes(t));
    if (hit) return hit;
  }
  const generic =
    ["shingle", "roofing", "siding", "window"].find((t) =>
      normalizedQuery.includes(t)
    ) ?? terms[0];
  return generic;
}

/** Higher = better tie-break (productLine alignment with query). */
function productLineMatchRank(
  plNorm: string,
  normalizedQuery: string,
  terms: string[]
): number {
  if (!plNorm) return 0;

  if (plNorm === normalizedQuery) return 5;
  if (
    normalizedQuery.length >= 4 &&
    plNorm.includes(normalizedQuery)
  ) {
    return 4;
  }
  if (plNorm.length >= 4 && normalizedQuery.includes(plNorm)) return 4;

  const meaningful = terms.filter((t) => t.length >= 2);
  if (
    meaningful.length > 0 &&
    meaningful.every((t) => plNorm.includes(normalizeText(t)))
  ) {
    return 3;
  }

  let hits = 0;
  for (const t of meaningful) {
    const tn = normalizeText(t);
    if (tn.length >= 2 && plNorm.includes(tn)) hits++;
  }
  if (hits >= 2) return 2;
  if (hits === 1) return 1;
  return 0;
}

function compareCandidates(
  a: {
    score: number;
    productLineRank: number;
    categoryId: string;
    subcategory: string;
    createdAt?: Date;
  },
  b: {
    score: number;
    productLineRank: number;
    categoryId: string;
    subcategory: string;
    createdAt?: Date;
  },
  strongestTerm: string
): number {
  if (a.score !== b.score) return b.score - a.score;

  if (a.productLineRank !== b.productLineRank)
    return b.productLineRank - a.productLineRank;

  const aRoofing = a.categoryId === "roofing" ? 1 : 0;
  const bRoofing = b.categoryId === "roofing" ? 1 : 0;
  if (aRoofing !== bRoofing) return bRoofing - aRoofing;

  const st = normalizeText(strongestTerm);
  const aStrong = st && normalizeText(a.subcategory).includes(st) ? 1 : 0;
  const bStrong = st && normalizeText(b.subcategory).includes(st) ? 1 : 0;
  if (aStrong !== bStrong) return bStrong - aStrong;

  const aAccessory = normalizeText(a.subcategory).includes("accessories")
    ? 1
    : 0;
  const bAccessory = normalizeText(b.subcategory).includes("accessories")
    ? 1
    : 0;
  if (aAccessory !== bAccessory) return aAccessory - bAccessory;

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
  const hasShingleIntent = /\bshingles?\b/.test(normalizedQuery);
  const metalIntent = isMetalRoofingIntent(normalizedQuery);
  const strongestQueryProductTerm = strongestProductTerm(
    normalizedQuery,
    terms,
    metalIntent
  );

  const matches = await prisma.supplierCapability.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { brand: { contains: term, mode: "insensitive" } },
        { subcategory: { contains: term, mode: "insensitive" } },
        { categoryId: { contains: term, mode: "insensitive" } },
        { productLine: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
      ]),
    } as any,
    orderBy: { createdAt: "desc" },
  });

  const scored = matches.map((record) => {
    let score = 0;

    const categoryId = String((record as any).categoryId || "");
    const brandNorm = normalizeText(record.brand);
    const subNorm = normalizeText(record.subcategory);
    const categoryNorm = normalizeText(categoryId);
    const plNorm = normalizeText(String((record as any).productLine || ""));
    const notesNorm = normalizeText(String((record as any).notes || ""));

    let hasBrandMatch = false;
    let hasSubcategoryMatch = false;
    let hasCategoryMatch = false;

    if (brandNorm === normalizedQuery) {
      score += 15;
      hasBrandMatch = true;
    }
    if (subNorm === normalizedQuery) {
      score += 12;
      hasSubcategoryMatch = true;
    }

    // productLine — weighted higher than subcategory for the same term overlap
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

      if (brandNorm === t) {
        score += 15;
        hasBrandMatch = true;
      } else if (brandNorm.includes(t)) {
        score += 6;
        hasBrandMatch = true;
      }

      if (plNorm === t) {
        score += 22;
      } else if (plNorm.includes(t)) {
        score += 14;
      }

      if (subNorm === t) {
        score += 12;
        hasSubcategoryMatch = true;
      } else if (subNorm.includes(t)) {
        score += 5;
        hasSubcategoryMatch = true;
      }

      if (categoryNorm === t || categoryNorm.includes(t)) {
        score += 4;
        hasCategoryMatch = true;
      }
    }

    if (hasBrandMatch && hasSubcategoryMatch) {
      score += 20;
    }

    for (const boosted of ["shingle", "roofing", "siding", "window"]) {
      if (normalizedQuery.includes(boosted) && subNorm.includes(boosted)) {
        score += 10;
      }
    }

    if (subNorm.includes("accessories")) {
      score -= 5;
    }

    if (hasShingleIntent) {
      if (categoryId === "roofing") {
        score += 20;
      }
      if (subNorm.includes("shingle") || subNorm.includes("steep slope")) {
        score += 20;
      }
      if (
        categoryId === "commercial_roofing" &&
        subNorm.includes("low slope")
      ) {
        score -= 20;
      }
    }

    // Light notes signal — never enough alone to beat a strong productLine match
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

    const productLineRank = productLineMatchRank(
      plNorm,
      normalizedQuery,
      terms
    );

    return {
      ...record,
      categoryId,
      score,
      productLineRank,
    };
  });

  const bestBySupplier = new Map<string, (typeof scored)[number]>();
  const matchedCategoriesBySupplier = new Map<string, Set<string>>();
  for (const result of scored) {
    const matchedCategories =
      matchedCategoriesBySupplier.get(result.supplierId) ?? new Set<string>();
    matchedCategories.add(result.categoryId);
    matchedCategoriesBySupplier.set(result.supplierId, matchedCategories);

    const current = bestBySupplier.get(result.supplierId);
    if (
      !current ||
      compareCandidates(
        current,
        result,
        normalizeText(strongestQueryProductTerm)
      ) > 0
    ) {
      bestBySupplier.set(result.supplierId, result);
    }
  }

  return Array.from(bestBySupplier.values())
    .filter((r) => r.score >= 5)
    .sort((a, b) =>
      compareCandidates(
        a,
        b,
        normalizeText(strongestQueryProductTerm)
      )
    )
    .slice(0, 10)
    .map((r) => ({
      supplierId: r.supplierId,
      categoryId: r.categoryId,
      subcategory: r.subcategory,
      brand: r.brand,
      sourceUrl: r.sourceUrl,
      score: r.score,
    }));
}
