/**
 * Normalize chat-style buyer text into a short product query for SerpAPI /
 * retailer adapters. Display and persistence should keep the original
 * requestText; only adapter.search() should use this helper.
 */

import { labelToCategoryId, type CategoryId } from "@/lib/categoryIds";
import { ontologyCategories } from "@/lib/search/ontology";

const PRODUCT_SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "buy",
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
  "search",
  "searching",
  "some",
  "the",
  "this",
  "to",
  "want",
  "with",
  "would",
]);

/** Chat prefixes → trailing product phrase capture group. */
const CONVERSATIONAL_PREFIX_PATTERNS: RegExp[] = [
  /^(?:i\s+)?(?:need|want)\s+(?:some|a|an|the)?\s*(?:help\s+)?(?:finding|to\s+find|to\s+buy|to\s+get)\s+(.+)$/i,
  /^looking\s+for\s+(?:some|a|an|the)?\s*(.+)$/i,
  /^(?:searching\s+for|find|finding)\s+(?:some|a|an|the)?\s*(.+)$/i,
];

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

function isProductToken(token: string): boolean {
  if (!token) return false;
  if (PRODUCT_SEARCH_STOP_WORDS.has(token)) return false;
  if (/\d/.test(token)) return true;
  return token.length >= 3;
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

/** Category labels / ids mentioned in chat (e.g. "paint", "flooring"). */
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

/** Prefer a specific ontology alias/term present in the query. */
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
      categoryTokens.every((t) => categoryTerm.includes(t) || t.includes(categoryTerm.split(" ")[0]!))
    ) {
      return categoryTerm;
    }
  }

  const tokens = productTokensFromText(searchBase);
  const productQuery = joinProductTokens(tokens);
  if (productQuery) return productQuery;

  return trimmed;
}
