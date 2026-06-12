import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import {
  expandBrowseQueryTokens,
  type ExpandedBrowseQuery,
} from "@/lib/search/browse/expandBrowseQueryTokens";
import {
  isCategoryBrowseUrl,
  isGenericCatalogRoot,
} from "@/lib/search/browse/isCategoryBrowseUrl";
import {
  DEFAULT_RANKED_URL_LIMIT,
  MIN_QUERY_RELEVANCE,
  scoreTextForQuery,
  tokenizeQuery,
} from "./rankUrlsByQuery";
export { DEFAULT_RANKED_URL_LIMIT, MIN_QUERY_RELEVANCE } from "./rankUrlsByQuery";

export const MIN_CATEGORY_BROWSE_RELEVANCE = 0.15;

export type BrowseAliasMatchType =
  | "direct_lexical"
  | "path_alias"
  | "title_alias"
  | "subcategory_expansion";

export type RankedBrowseUrl = {
  url: string;
  score: number;
  aliasSourceProductType?: string;
  aliasMatchType?: BrowseAliasMatchType;
};

function pathnameLower(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function pathContainsTerm(path: string, term: string): boolean {
  const normalized = term.toLowerCase().replace(/\s+/g, "-");
  return path.includes(normalized) || path.includes(term.toLowerCase());
}

function scorePathAgainstTerms(path: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  let matches = 0;
  for (const term of terms) {
    if (pathContainsTerm(path, term)) matches += 1;
  }
  return matches / terms.length;
}

export function scoreBrowseUrlForQuery(
  url: string,
  expanded: ExpandedBrowseQuery
): RankedBrowseUrl {
  const path = pathnameLower(url);

  if (isGenericCatalogRoot(url)) {
    return { url, score: 0 };
  }

  const directScore = scoreTextForQuery(path, expanded.baseTokens);
  if (directScore > 0) {
    let score = directScore;
    if (classifyUrl(url) === "PRODUCT_PAGE") {
      score = Math.min(1, score + 0.15);
    }
    if (isCategoryBrowseUrl(url)) {
      score = Math.min(1, score + 0.1);
    }
    return { url, score, aliasMatchType: "direct_lexical" };
  }

  let best: RankedBrowseUrl = { url, score: 0 };

  for (const matched of expanded.matchedProductTypes) {
    for (const fragment of matched.config.parentExpansionPaths ?? []) {
      if (pathContainsTerm(path, fragment)) {
        const parentScore = Math.min(1, 0.2 + (isCategoryBrowseUrl(url) ? 0.1 : 0));
        if (parentScore > best.score) {
          best = {
            url,
            score: parentScore,
            aliasSourceProductType: matched.productTypeId,
            aliasMatchType: "path_alias",
          };
        }
      }
    }

    for (const term of matched.config.pathTerms) {
      if (!pathContainsTerm(path, term)) continue;
      const termTokens = tokenizeQuery(term);
      const aliasScore = scorePathAgainstTerms(path, termTokens);
      if (aliasScore <= best.score) continue;

      let score = aliasScore;
      if (isCategoryBrowseUrl(url)) {
        score = Math.min(1, score + 0.1);
      }

      best = {
        url,
        score,
        aliasSourceProductType: matched.productTypeId,
        aliasMatchType: "path_alias",
      };
    }
  }

  const queryAliasScore = scorePathAgainstTerms(
    path,
    expanded.expandedTokens.filter((token) => !expanded.baseTokens.includes(token))
  );
  if (queryAliasScore > best.score) {
    best = {
      url,
      score: Math.min(1, isCategoryBrowseUrl(url) ? queryAliasScore + 0.1 : queryAliasScore),
      aliasMatchType: "path_alias",
    };
  }

  return best;
}

export function rankBrowseUrlsByQuery(
  urls: string[],
  query: string,
  limit = DEFAULT_RANKED_URL_LIMIT
): RankedBrowseUrl[] {
  const expanded = expandBrowseQueryTokens(query);
  const unique = [...new Set(urls)];
  return unique
    .map((url) => scoreBrowseUrlForQuery(url, expanded))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function hasBrowseAliasPathMatch(
  url: string,
  query: string
): boolean {
  const ranked = scoreBrowseUrlForQuery(url, expandBrowseQueryTokens(query));
  return (
    ranked.aliasMatchType === "path_alias" ||
    ranked.aliasMatchType === "subcategory_expansion"
  );
}

export function meetsBrowseRelevance(
  urlScore: number,
  title: string,
  query: string,
  url: string,
  browseRank?: RankedBrowseUrl
): boolean {
  if (isGenericCatalogRoot(url)) {
    return false;
  }

  const directTokens = tokenizeQuery(query);
  const titleScore = scoreTextForQuery(title, directTokens);
  const score = Math.max(urlScore, titleScore);

  const aliasMatch =
    browseRank?.aliasMatchType === "path_alias" ||
    browseRank?.aliasMatchType === "subcategory_expansion" ||
    browseRank?.aliasMatchType === "title_alias" ||
    hasBrowseAliasPathMatch(url, query);

  if (isCategoryBrowseUrl(url) && aliasMatch) {
    return score >= MIN_CATEGORY_BROWSE_RELEVANCE;
  }

  return score >= MIN_QUERY_RELEVANCE;
}

export function getSubcategoryExpansionSeedUrls(
  candidateUrls: string[],
  query: string,
  ranked: RankedBrowseUrl[],
  maxSeeds = 2
): string[] {
  const expanded = expandBrowseQueryTokens(query);
  const seeds = new Set<string>();

  for (const entry of ranked.slice(0, maxSeeds)) {
    if (entry.score > 0) seeds.add(entry.url);
  }

  for (const matched of expanded.matchedProductTypes) {
    for (const fragment of matched.config.parentExpansionPaths ?? []) {
      for (const url of candidateUrls) {
        if (pathnameLower(url).includes(fragment.toLowerCase())) {
          seeds.add(url);
        }
      }
    }
  }

  return [...seeds].slice(0, maxSeeds);
}
