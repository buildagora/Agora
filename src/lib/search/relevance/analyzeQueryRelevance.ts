import { searchOntologyByQuery } from "@/lib/search/ontology";

export type QueryRelevanceAnalysis = {
  normalizedQuery: string;
  tokens: string[];
  importantTerms: string[];
  brandIntentTerms: string[];
  conflictingBrandTerms: string[];
  excludedBrandTerms: string[];
  ontologyCategoryIds: string[];
  ontologyProductTypeIds: string[];
  ontologyProductTypeLabels: string[];
  ontologyBrandIds: string[];
  ontologyBrandLabels: string[];
  ontologyMatchedAliases: string[];
  ontologyPositiveTerms: string[];
  ontologyNegativeTerms: string[];
  ontologySignals: string[];
};

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const OWENS_CORNING_INTENT_TERMS = ["owens", "corning", "oakridge"] as const;
const OWENS_CORNING_CONFLICTING_BRANDS = ["atlas", "gaf", "certainteed", "tamko", "iko"] as const;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeToken(token: string): string {
  return token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
}

function dedupeNormalized(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeToken(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Transitional query relevance analyzer.
 *
 * Today this is query-driven and category-agnostic. In a future phase, this file is the
 * insertion point for construction ontology/category-aware term and brand intent mapping.
 */
export function analyzeQueryRelevance(query: string): QueryRelevanceAnalysis {
  const normalizedQuery = normalizeQuery(query);
  const rawTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const tokens = rawTokens.map(normalizeToken).filter(Boolean);
  const uniqueTokens = [...new Set(tokens)];

  const ontologyMatches = searchOntologyByQuery(normalizedQuery);
  const ontologyCategoryIds = [...new Set(ontologyMatches.map((match) => match.categoryId))];

  const ontologyProductTypes = ontologyMatches.flatMap((match) => match.productTypes);
  const ontologyBrands = ontologyMatches.flatMap((match) => match.brands);

  const ontologyProductTypeIds = [...new Set(ontologyProductTypes.map((productType) => productType.id))];
  const ontologyProductTypeLabels = [
    ...new Set(ontologyProductTypes.map((productType) => productType.label)),
  ];
  const ontologyBrandIds = [...new Set(ontologyBrands.map((brand) => brand.id))];
  const ontologyBrandLabels = [...new Set(ontologyBrands.map((brand) => brand.label))];

  const ontologyMatchedAliases = dedupeNormalized([
    ...ontologyProductTypes.flatMap((productType) =>
      productType.aliases.filter((alias) => normalizedQuery.includes(alias.toLowerCase())),
    ),
    ...ontologyBrands.flatMap((brand) =>
      brand.aliases.filter((alias) => normalizedQuery.includes(alias.toLowerCase())),
    ),
  ]);
  const ontologyPositiveTerms = dedupeNormalized(
    ontologyProductTypes.flatMap((productType) => productType.positiveTerms),
  );
  const ontologyNegativeTerms = dedupeNormalized(
    ontologyProductTypes.flatMap((productType) => productType.negativeTerms),
  );

  const ontologySignals: string[] = [];
  if (ontologyCategoryIds.length > 0) ontologySignals.push("ontology_category_match");
  if (ontologyProductTypeIds.length > 0) ontologySignals.push("ontology_product_type_match");
  if (ontologyBrandIds.length > 0) ontologySignals.push("ontology_brand_match");
  if (ontologyMatchedAliases.length > 0) ontologySignals.push("ontology_alias_match");

  // Keep base behavior query-driven, then enrich additively with ontology positives.
  const baseImportantTerms = uniqueTokens.filter((token) => !QUERY_STOP_WORDS.has(token));
  const importantTerms = [...new Set([...baseImportantTerms, ...ontologyPositiveTerms])];

  const brandIntentTerms = OWENS_CORNING_INTENT_TERMS.filter((term) =>
    normalizedQuery.includes(term),
  );
  const conflictingBrandTerms =
    brandIntentTerms.length > 0 ? [...OWENS_CORNING_CONFLICTING_BRANDS] : [];

  return {
    normalizedQuery,
    tokens: uniqueTokens,
    importantTerms,
    brandIntentTerms,
    conflictingBrandTerms,
    excludedBrandTerms: conflictingBrandTerms,
    ontologyCategoryIds,
    ontologyProductTypeIds,
    ontologyProductTypeLabels,
    ontologyBrandIds,
    ontologyBrandLabels,
    ontologyMatchedAliases,
    ontologyPositiveTerms,
    ontologyNegativeTerms,
    ontologySignals,
  };
}

