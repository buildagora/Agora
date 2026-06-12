import { classifyUrl } from "@/lib/search/classification/classifyUrl";
import type { SearchResultType } from "@/lib/search/classification/resultTypes";
import { analyzeQueryRelevance } from "@/lib/search/relevance/analyzeQueryRelevance";

export type OrganicCandidateInput = {
  link: string;
  title?: string;
  thumbnail?: string;
  query: string;
  domain: string;
};

export type ScoredOrganicCandidate = OrganicCandidateInput & {
  score: number;
  resultType: SearchResultType;
};

const NEGATIVE_PATH_MARKERS = [
  "/blog",
  "/news",
  "/careers",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/location",
  "/locations",
  "/press",
  "/media",
  "/team",
  "/leadership",
  "/events",
  "/faq",
  "/support",
  "/login",
  "/signup",
  "/account",
  "/cart",
  "/checkout",
] as const;

function pathnameLower(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function tokenOverlap(haystack: string, tokens: string[]): number {
  let score = 0;
  for (const token of tokens) {
    if (token.length >= 3 && haystack.includes(token)) {
      score += 8;
    }
  }
  return score;
}

/**
 * Score a SERP organic candidate URL before page fetch / extraction.
 * Higher scores prefer product/catalog pages with query overlap; junk paths score low.
 */
export function scoreOrganicCandidateUrl(input: OrganicCandidateInput): number {
  const link = input.link.trim();
  if (!link) return -1000;

  const resultType = classifyUrl(link);
  const path = pathnameLower(link);
  const title = String(input.title || "").toLowerCase();
  const relevance = analyzeQueryRelevance(input.query);
  const normalizedQuery = relevance.normalizedQuery.toLowerCase();

  let score = 0;

  switch (resultType) {
    case "PRODUCT_PAGE":
      score += 90;
      break;
    case "CATEGORY_PAGE":
      score += 55;
      break;
    case "SEARCH_PAGE":
      score += 45;
      break;
    case "BRAND_PAGE":
      score += 35;
      break;
    case "HOMEPAGE":
      score -= 70;
      break;
    case "BLOG_PAGE":
      score -= 120;
      break;
    case "DOCUMENTATION_PAGE":
      score -= 90;
      break;
    case "PDF_PAGE":
      score -= 80;
      break;
    case "UNKNOWN":
      score -= 50;
      break;
  }

  if (path.includes("/catalog/") || path.includes("/shop/") || path.includes("/browse/")) {
    score += 15;
  }

  for (const marker of NEGATIVE_PATH_MARKERS) {
    if (path.includes(marker)) {
      score -= 40;
    }
  }

  if (normalizedQuery && title.includes(normalizedQuery)) {
    score += 35;
  }
  if (normalizedQuery && path.includes(normalizedQuery.replace(/\s+/g, "-"))) {
    score += 25;
  }
  if (normalizedQuery && path.includes(normalizedQuery.replace(/\s+/g, "/"))) {
    score += 20;
  }

  score += tokenOverlap(title, relevance.tokens);
  score += tokenOverlap(path.replace(/-/g, " "), relevance.tokens);
  score += tokenOverlap(path.replace(/\//g, " "), relevance.tokens);

  for (const term of relevance.importantTerms) {
    if (title.includes(term) || path.includes(term)) {
      score += 18;
    }
  }

  for (const brand of relevance.conflictingBrandTerms) {
    if (title.includes(brand) || path.includes(brand)) {
      score -= 45;
    }
  }

  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    const domain = input.domain.replace(/^www\./, "");
    if (host === domain || host.endsWith(`.${domain}`)) {
      score += 10;
    }
  } catch {
    score -= 20;
  }

  if (input.thumbnail?.trim()) {
    score += 20;
  }

  return score;
}

export function rankOrganicCandidates(
  candidates: OrganicCandidateInput[]
): ScoredOrganicCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      resultType: classifyUrl(candidate.link),
      score: scoreOrganicCandidateUrl(candidate),
    }))
    .sort((a, b) => b.score - a.score);
}
