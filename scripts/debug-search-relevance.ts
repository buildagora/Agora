/**
 * Debug supplier search relevance (capability DB + category gate only — no SerpAPI).
 *
 *   npx tsx scripts/debug-search-relevance.ts
 *
 * Requires DATABASE_URL (e.g. .env.local).
 */

import { getPrisma } from "@/lib/db.server";
import type { CategoryId } from "@/lib/categoryIds";
import { haversineMiles } from "@/lib/search/distance";
import {
  searchCapabilities,
  type CapabilitySearchResult,
} from "@/lib/search/capabilitySearch";
import {
  extractProductSearchTerms,
  toProductSearchQuery,
} from "@/lib/search/productSearchQuery";
import { normalizeToCanonicalCategoryId } from "@/lib/suppliers/categoryTaxonomy";
type SupplierCategoryRow = {
  name: string;
  latitude: number | null;
  longitude: number | null;
  primaryCategoryId: string | null;
  categoryLinks: { categoryId: string }[];
};

function supplierCategoryId(s: SupplierCategoryRow): string {
  return (
    s.primaryCategoryId ??
    s.categoryLinks[0]?.categoryId ??
    "unknown"
  );
}

const supplierCategorySelect = {
  name: true,
  latitude: true,
  longitude: true,
  primaryCategoryId: true,
  categoryLinks: { select: { categoryId: true } },
} as const;

const RADIUS_MILES = 25;
const MAX_RESULTS = 25;
const LOCATION = { label: "Huntsville, AL", lat: 34.7304, lng: -86.5861 };

const LEGACY_STOP = new Set([
  "a", "an", "and", "are", "at", "be", "buy", "for", "from", "i", "in", "is",
  "it", "me", "my", "need", "of", "on", "or", "please", "the", "this", "to",
  "want", "with",
]);

function legacyMeaningfulTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const raw of text.trim().split(/\s+/)) {
    const token = raw.trim().toLowerCase();
    if (token.length < 3 || LEGACY_STOP.has(token)) continue;
    terms.add(token);
  }
  return [...terms];
}

async function legacyRawCapabilitySearch(
  query: string
): Promise<CapabilitySearchResult[]> {
  const prisma = getPrisma();
  const terms = legacyMeaningfulTerms(query.toLowerCase());
  if (terms.length === 0) return [];

  const matches = await prisma.supplierCapability.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { productLine: { contains: term, mode: "insensitive" as const } },
        { subcategory: { contains: term, mode: "insensitive" as const } },
        { brand: { contains: term, mode: "insensitive" as const } },
        { notes: { contains: term, mode: "insensitive" as const } },
        { categoryId: { contains: term, mode: "insensitive" as const } },
      ]),
    },
    take: 500,
  });

  const supplierIds = [...new Set(matches.map((m) => m.supplierId))];
  return supplierIds.slice(0, 40).map((supplierId) => {
    const row = matches.find((m) => m.supplierId === supplierId)!;
    return {
      supplierId,
      categoryId: String(row.categoryId),
      subcategory: row.subcategory,
      brand: row.brand,
      productLine: row.productLine,
      sourceUrl: row.sourceUrl,
      score: 10,
    };
  });
}

type CaseSpec = {
  query: string;
  inferredCategory: CategoryId;
  disfavorCategories: CategoryId[];
};

const CASES: CaseSpec[] = [
  {
    query: "Can you help me find a 2x4",
    inferredCategory: "lumber_siding",
    disfavorCategories: [
      "tools_equipment",
      "flooring",
      "plumbing",
      "hvac",
      "concrete_cement",
      "electrical",
    ],
  },
  {
    query: "I need help finding a sink",
    inferredCategory: "plumbing",
    disfavorCategories: ["tools_equipment"],
  },
  {
    query: "Looking for shingles",
    inferredCategory: "roofing",
    disfavorCategories: [
      "tools_equipment",
      "plumbing",
      "hvac",
      "flooring",
      "concrete_cement",
    ],
  },
  {
    query: "Need paint",
    inferredCategory: "paint",
    disfavorCategories: ["tools_equipment", "plumbing", "roofing"],
  },
  {
    query: "I need drywall",
    inferredCategory: "drywall",
    disfavorCategories: ["tools_equipment", "plumbing", "roofing"],
  },
];

function gateMatches(
  raw: CapabilitySearchResult[],
  inferredCategory: CategoryId
): CapabilitySearchResult[] {
  return raw.filter((m) => {
    const matchCat =
      normalizeToCanonicalCategoryId(m.categoryId) ?? m.categoryId.toLowerCase();
    return matchCat === inferredCategory;
  });
}

async function supplierNamesForMatches(
  matches: CapabilitySearchResult[]
): Promise<string[]> {
  const prisma = getPrisma();
  const ids = [...new Set(matches.map((m) => m.supplierId))];
  if (ids.length === 0) return [];
  const rows = await prisma.supplier.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...supplierCategorySelect },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const withinRadius: { name: string; categoryId: string; distance: number }[] =
    [];
  for (const id of ids) {
    const s = byId.get(id);
    if (!s?.latitude || !s.longitude) continue;
    const distance = haversineMiles(
      { lat: LOCATION.lat, lng: LOCATION.lng },
      { lat: s.latitude, lng: s.longitude }
    );
    if (distance > RADIUS_MILES) continue;
    withinRadius.push({
      name: s.name,
      categoryId: supplierCategoryId(s),
      distance: Math.round(distance * 10) / 10,
    });
  }
  withinRadius.sort((a, b) => a.distance - b.distance);
  return withinRadius.map((x) => `${x.name} (${x.categoryId}, ${x.distance}mi)`);
}

async function categoryAlignedNames(
  inferredCategory: CategoryId,
  limit = MAX_RESULTS
): Promise<string[]> {
  const prisma = getPrisma();
  const suppliers = await prisma.supplier.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      OR: [
        { primaryCategoryId: inferredCategory },
        { categoryLinks: { some: { categoryId: inferredCategory } } },
      ],
    },
    select: supplierCategorySelect,
    take: 80,
  });

  const ranked = suppliers
    .map((s) => ({
      name: s.name,
      categoryId: supplierCategoryId(s),
      distance: haversineMiles(
        { lat: LOCATION.lat, lng: LOCATION.lng },
        { lat: s.latitude!, lng: s.longitude! }
      ),
    }))
    .filter((s) => s.distance <= RADIUS_MILES)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return ranked.map(
    (x) => `${x.name} (${x.categoryId}, ${Math.round(x.distance * 10) / 10}mi)`
  );
}

async function simulateLegacy(query: string, inferredCategory: CategoryId) {
  const raw = await legacyRawCapabilitySearch(query);
  const gated = gateMatches(raw, inferredCategory);
  const matches = gated.length > 0 ? gated : raw;
  return supplierNamesForMatches(matches);
}

async function simulateNew(query: string, inferredCategory: CategoryId) {
  const productSearchQuery = toProductSearchQuery(query) || query.trim();
  const raw = await searchCapabilities(productSearchQuery, {
    originalQuery: query,
  });
  const gated = gateMatches(raw, inferredCategory);
  const matches = gated.length > 0 ? gated : [];
  if (matches.length > 0) {
    return supplierNamesForMatches(matches);
  }
  const categoryAligned = await categoryAlignedNames(inferredCategory, 12);
  const bigBox = ["home_depot (live-catalog)", "lowes (live-catalog)"];
  return [...categoryAligned.slice(0, 10), ...bigBox];
}

async function main() {
  console.log("Search relevance debug (local DB, no SerpAPI)\n");
  console.log(`Location: ${LOCATION.label} (${RADIUS_MILES}mi radius)\n`);

  for (const spec of CASES) {
    const productSearchQuery = toProductSearchQuery(spec.query);
    const terms = extractProductSearchTerms(spec.query, {
      originalQuery: spec.query,
    });
    const legacyTerms = legacyMeaningfulTerms(spec.query);

    console.log("=".repeat(72));
    console.log(`Query: "${spec.query}"`);
    console.log(`Inferred category (fixture): ${spec.inferredCategory}`);
    console.log(`Product search query: "${productSearchQuery}"`);
    console.log(`Product terms: ${terms.join(", ") || "(none)"}`);
    console.log(`Legacy terms: ${legacyTerms.join(", ")}`);

    const [before, after] = await Promise.all([
      simulateLegacy(spec.query, spec.inferredCategory),
      simulateNew(spec.query, spec.inferredCategory),
    ]);

    console.log("\nBEFORE (legacy terms + raw fallback):");
    before.slice(0, 15).forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
    if (before.length > 15) console.log(`  ... +${before.length - 15} more`);

    console.log("\nAFTER (product query + safe gate + category fallback):");
    after.slice(0, 15).forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
    if (after.length > 15) console.log(`  ... +${after.length - 15} more`);

    const disfavoredBefore = before.filter((line) =>
      spec.disfavorCategories.some((c) => line.includes(`(${c},`))
    );
    const disfavoredAfter = after.filter((line) =>
      spec.disfavorCategories.some((c) => line.includes(`(${c},`))
    );
    console.log(
      `\nDisfavored categories in top 15: before=${disfavoredBefore.length}, after=${disfavoredAfter.length}`
    );
    console.log();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
