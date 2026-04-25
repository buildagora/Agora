/**
 * Gemini query → category classifier.
 *
 * Single fast call (no grounding), used to map free-form queries like
 * "I need shingles" → "roofing". Returns null if Gemini can't confidently
 * map to one of the supplied categories.
 */

import "server-only";
import { getGenAI, getGeminiModel } from "./gemini.server";

const SYSTEM_INSTRUCTION = `You map a builder's natural-language supply request to one category from a fixed list. Be strict: respond with EXACTLY one category id from the list, or the literal string "unknown" if no category clearly fits. No commentary, no explanation, just the id.`;

export async function classifyQueryToCategory(args: {
  query: string;
  categories: string[];
}): Promise<{ category: string | null; usage?: { input?: number; output?: number } }> {
  if (args.categories.length === 0) return { category: null };

  const list = args.categories.map((c) => `- ${c}`).join("\n");
  const prompt = `Categories:
${list}

Query: "${args.query}"

Respond with one category id from the list above, or "unknown".`;

  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });

  const raw = (response.text ?? "").trim().toLowerCase();
  // Strip surrounding quotes/backticks if Gemini decorates
  const cleaned = raw.replace(/^["'`]|["'`]$/g, "").trim();

  const validSet = new Set(args.categories.map((c) => c.toLowerCase()));
  const category = validSet.has(cleaned) ? cleaned : null;

  const usage = response.usageMetadata
    ? {
        input: response.usageMetadata.promptTokenCount,
        output: response.usageMetadata.candidatesTokenCount,
      }
    : undefined;

  return { category, usage };
}
