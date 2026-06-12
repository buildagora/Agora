import { searchOntologyByQuery } from "@/lib/search/ontology";
import {
  CATEGORY_BROWSE_ALIASES,
  QUERY_BROWSE_ALIASES,
  type CategoryBrowseAliasConfig,
} from "./categoryBrowseAliases";
import { tokenizeQuery } from "@/lib/suppliers/schema/rankUrlsByQuery";

export type MatchedBrowseProductType = {
  productTypeId: string;
  categoryId: string;
  config: CategoryBrowseAliasConfig;
};

export type ExpandedBrowseQuery = {
  query: string;
  baseTokens: string[];
  expandedTokens: string[];
  matchedProductTypes: MatchedBrowseProductType[];
};

function normalizeQueryKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens.map((token) => token.trim().toLowerCase()).filter(Boolean))];
}

export function expandBrowseQueryTokens(query: string): ExpandedBrowseQuery {
  const normalized = normalizeQueryKey(query);
  const baseTokens = tokenizeQuery(query);
  const expanded = new Set<string>(baseTokens);
  const matchedProductTypes: MatchedBrowseProductType[] = [];

  for (const match of searchOntologyByQuery(query)) {
    for (const productType of match.productTypes) {
      const config = CATEGORY_BROWSE_ALIASES[productType.id];
      if (!config) continue;

      matchedProductTypes.push({
        productTypeId: productType.id,
        categoryId: match.categoryId,
        config,
      });

      for (const term of config.pathTerms) {
        for (const token of tokenizeQuery(term)) {
          expanded.add(token);
        }
      }
    }
  }

  const queryAliases = QUERY_BROWSE_ALIASES[normalized];
  if (queryAliases) {
    for (const term of queryAliases) {
      for (const token of tokenizeQuery(term)) {
        expanded.add(token);
      }
    }
  }

  return {
    query,
    baseTokens,
    expandedTokens: uniqueTokens([...expanded]),
    matchedProductTypes,
  };
}
