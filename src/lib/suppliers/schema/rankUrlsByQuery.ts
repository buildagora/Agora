import { classifyUrl } from "@/lib/search/classification/classifyUrl";

export const MIN_QUERY_RELEVANCE = 0.25;
export const DEFAULT_RANKED_URL_LIMIT = 10;

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function pathnameLower(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function scoreTextForQuery(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let matches = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matches += 1;
  }
  return matches / tokens.length;
}

export function scoreUrlForQuery(url: string, query: string): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0;

  let score = scoreTextForQuery(pathnameLower(url), tokens);
  if (score > 0 && classifyUrl(url) === "PRODUCT_PAGE") {
    score = Math.min(1, score + 0.15);
  }
  return score;
}

export function rankUrlsByQuery(
  urls: string[],
  query: string,
  limit = DEFAULT_RANKED_URL_LIMIT
): { url: string; score: number }[] {
  const unique = [...new Set(urls)];
  return unique
    .map((url) => ({ url, score: scoreUrlForQuery(url, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function meetsMinimumRelevance(
  urlScore: number,
  title: string,
  query: string
): boolean {
  const titleScore = scoreTextForQuery(title, tokenizeQuery(query));
  return Math.max(urlScore, titleScore) >= MIN_QUERY_RELEVANCE;
}
