import { getPrisma } from "@/lib/db.server";

export type CapabilitySearchResult = {
  supplierId: string;
  subcategory: string;
  brand: string;
  sourceUrl: string;
  score: number;
};

function meaningfulTerms(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export async function searchCapabilities(
  query: string
): Promise<CapabilitySearchResult[]> {
  const prisma = getPrisma();

  const terms = meaningfulTerms(query);
  if (terms.length === 0) {
    return [];
  }

  const matches = await prisma.supplierCapability.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { brand: { contains: term, mode: "insensitive" } },
        { subcategory: { contains: term, mode: "insensitive" } },
      ]),
    },
    orderBy: { createdAt: "desc" },
  });

  const scored = matches.map((record) => {
    let score = 0;

    const brandLower = record.brand.toLowerCase();
    const subLower = record.subcategory.toLowerCase();

    for (const term of terms) {
      const t = term.toLowerCase();

      if (brandLower === t) score += 10;
      else if (brandLower.includes(t)) score += 5;

      if (subLower.includes(t)) score += 3;
    }

    return { ...record, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();

  const deduped: typeof scored = [];

  for (const result of scored) {
    const key = `${result.supplierId}_${result.brand}`;

    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(result);
  }

  return deduped
    .filter((r) => r.score >= 5)
    .slice(0, 10)
    .map((r) => ({
      supplierId: r.supplierId,
      subcategory: r.subcategory,
      brand: r.brand,
      sourceUrl: r.sourceUrl,
      score: r.score,
    }));
}
