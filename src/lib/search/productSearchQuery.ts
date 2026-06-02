/**
 * Normalize chat-style buyer text into a short product query for SerpAPI,
 * capability search, and retailer adapters. Display and persistence should
 * keep the original requestText; only search/adapter paths use these helpers.
 */

import { labelToCategoryId, type CategoryId } from "@/lib/categoryIds";
import { ontologyCategories } from "@/lib/search/ontology";

/** Shared stop words for capability + Serp product tokenization. */
export const PRODUCT_SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "buy",
  "can",
  "could",
  "find",
  "finding",
  "for",
  "from",
  "get",
  "help",
  "i",
  "in",
  "is",
  "it",
  "looking",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "purchase",
  "search",
  "searching",
  "some",
  "the",
  "this",
  "to",
  "want",
  "with",
  "would",
  "you",
]);

/** Short tokens that must never match as substrings inside longer words. */
export const SHORT_SUBSTRING_BLOCKLIST = new Set(["can", "you"]);

const DIMENSION_PATTERN = /\d+\s*x\s*\d+|\d+\s*\/\s*\d+/gi;

/** Chat prefixes → trailing product phrase capture group. */
const CONVERSATIONAL_PREFIX_PATTERNS: RegExp[] = [
  /^(?:can\s+you\s+)?(?:please\s+)?help\s+me\s+(?:find|get|buy|locate)\s+(?:some|a|an|the)?\s*(.+)$/i,
  /^(?:i\s+)?(?:need|want)\s+(?:some|a|an|the)?\s*(?:help\s+)?(?:finding|to\s+find|to\s+buy|to\s+get|to\s+purchase)\s+(.+)$/i,
  /^looking\s+for\s+(?:some|a|an|the)?\s*(.+)$/i,
  /^(?:searching\s+for|find|finding)\s+(?:some|a|an|the)?\s*(.+)$/i,
];

export function normalizeSearchText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function tokenize(query: string): string[] {
  return normalizeWhitespace(query)
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** e.g. 2x4, 4x8, 1/2, 3/4 */
export function isDimensionOrFractionToken(term: string): boolean {
  const t = term.replace(/\s+/g, "").toLowerCase();
  if (/^\d+x\d+$/.test(t)) return true;
  if (/^\d+\/\d+$/.test(t)) return true;
  return false;
}

export function isProductToken(token: string): boolean {
  if (!token) return false;
  if (PRODUCT_SEARCH_STOP_WORDS.has(token)) return false;
  if (isDimensionOrFractionToken(token)) return true;
  if (/\d/.test(token)) return true;
  return token.length >= 4;
}

function productTokensFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(text)) {
    if (!isProductToken(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function extractDimensionTerms(text: string): string[] {
  const normalized = normalizeSearchText(text);
  const terms = new Set<string>();
  const matches = normalized.match(DIMENSION_PATTERN) ?? [];
  for (const raw of matches) {
    const compact = raw.replace(/\s+/g, "");
    if (compact) terms.add(compact);
    const spaced = raw.replace(/\s+/g, " ").trim();
    if (spaced.includes("x")) {
      const parts = spaced.split(/\s*x\s*/);
      if (parts.length === 2) {
        terms.add(`${parts[0]}x${parts[1]}`);
      }
    }
  }
  return [...terms];
}

function extractConversationalProductPhrase(query: string): string | null {
  const trimmed = query.trim();
  for (const pattern of CONVERSATIONAL_PREFIX_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const phrase = normalizeWhitespace(match[1]);
      if (phrase) return phrase;
    }
  }
  return null;
}

function matchCategorySearchTerm(normalizedQuery: string): string | null {
  const lower = normalizedQuery.toLowerCase();

  for (const [label, categoryId] of Object.entries(labelToCategoryId)) {
    const labelLower = label.toLowerCase();
    if (lower === labelLower || lower.includes(labelLower)) {
      const idTerm = categoryId.replace(/_/g, " ");
      if (lower.includes(idTerm) || lower.includes(categoryId)) {
        return idTerm;
      }
      const words = labelLower.split(/\s+/).filter((w) => w.length >= 4);
      const head = words[0];
      if (head && lower.includes(head)) return head;
    }
  }

  for (const id of Object.keys(labelToCategoryId) as CategoryId[]) {
    const idTerm = id.replace(/_/g, " ");
    if (lower === id || lower === idTerm || lower.endsWith(` ${idTerm}`)) {
      return idTerm;
    }
  }

  return null;
}

function matchOntologyProductPhrase(normalizedQuery: string): string | null {
  const lower = normalizedQuery.toLowerCase();
  let best: { phrase: string; length: number } | null = null;

  for (const category of ontologyCategories) {
    for (const productType of category.productTypes) {
      const candidates = [
        ...productType.aliases,
        productType.label,
        ...productType.positiveTerms,
      ];
      for (const raw of candidates) {
        const phrase = raw.trim().toLowerCase();
        if (phrase.length < 3 || !lower.includes(phrase)) continue;
        if (!best || phrase.length > best.length) {
          best = { phrase, length: phrase.length };
        }
      }
    }
  }

  return best?.phrase ?? null;
}

function joinProductTokens(tokens: string[]): string {
  if (tokens.length === 0) return "";
  return tokens.join(" ");
}

/**
 * Product-intent tokens for capability DB lookup and scoring.
 * Pulls dimensions from the original chat text; strips filler from token list.
 */
export function extractProductSearchTerms(
  query: string,
  options?: { originalQuery?: string }
): string[] {
  const original = options?.originalQuery ?? query;
  const productPhrase = toProductSearchQuery(query) || normalizeWhitespace(query);
  const terms = new Set<string>();

  for (const dim of extractDimensionTerms(original)) {
    terms.add(dim);
  }

  const phraseLower = productPhrase.toLowerCase();
  if (
    phraseLower.includes(" ") &&
    productTokensFromText(productPhrase).length >= 2
  ) {
    terms.add(phraseLower);
  }

  for (const token of productTokensFromText(productPhrase)) {
    terms.add(token);
  }

  return [...terms];
}

/**
 * Whether a normalized field value matches a search term without substring
 * false positives (e.g. "can" must not match "Vulcan").
 */
export function fieldMatchesSearchTerm(
  fieldNorm: string,
  term: string
): boolean {
  if (!fieldNorm || !term) return false;
  const t = normalizeSearchText(term);
  const field = fieldNorm;

  if (field === t) return true;

  if (isDimensionOrFractionToken(t) || t.length >= 4) {
    return field.includes(t);
  }

  if (SHORT_SUBSTRING_BLOCKLIST.has(t)) {
    return false;
  }

  if (t.length <= 3) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(t)}(?:\\s|$)`);
    return re.test(field);
  }

  return field.includes(t);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip conversational filler for retailer / Serp product search.
 * Falls back to the trimmed original when no product terms are found.
 */
export function toProductSearchQuery(query: string): string {
  const trimmed = normalizeWhitespace(query);
  if (!trimmed) return "";

  const conversationalPhrase = extractConversationalProductPhrase(trimmed);
  const searchBase = normalizeWhitespace(conversationalPhrase ?? trimmed);
  const searchLower = searchBase.toLowerCase();

  const ontologyPhrase = matchOntologyProductPhrase(searchLower);
  if (ontologyPhrase) return ontologyPhrase;

  const categoryTerm = matchCategorySearchTerm(searchLower);
  if (categoryTerm) {
    const categoryTokens = productTokensFromText(searchLower);
    if (
      categoryTokens.length === 0 ||
      categoryTokens.every(
        (tok) =>
          categoryTerm.includes(tok) ||
          tok.includes(categoryTerm.split(" ")[0]!)
      )
    ) {
      return categoryTerm;
    }
  }

  const dimTerms = extractDimensionTerms(trimmed);
  if (dimTerms.length > 0) {
    return dimTerms[0]!;
  }

  const tokens = productTokensFromText(searchBase);
  const productQuery = joinProductTokens(tokens);
  if (productQuery) return productQuery;

  return trimmed;
}
