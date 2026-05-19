/**
 * Gemini-powered supplier-capability extraction.
 *
 * Given a supplier (name, domain, location, tagged categories), asks Gemini —
 * with Google Search grounding — to list the brands and product lines the
 * supplier carries. Returns structured rows ready to insert as
 * `SupplierCapability`.
 *
 * Why this exists: the earlier regex-on-title crawler found ~0 brand matches
 * because most supplier websites don't surface brand names in page titles.
 * Gemini can use prior knowledge of distributor brand carriages plus Google
 * Search to fill in coverage that title-matching can't.
 *
 * No `import "server-only"` — this module is imported from the CLI crawler
 * under scripts/ as well as from server code.
 */

import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment");
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export type ExtractedCapability = {
  brand: string;
  productType: string;
  categoryId: string;
  productLines: string[];
};

export type SupplierForExtraction = {
  id: string;
  name: string;
  domain: string | null;
  city: string;
  state: string;
  categoryIds: string[]; // normalized lowercase ids, e.g. ["roofing"]
};

const SYSTEM_INSTRUCTION = `You are a construction supply industry expert helping populate a US-focused supplier catalog.

For each supplier you are asked about, list the brands and product lines you have evidence the supplier carries. Use your prior knowledge of supply distributors plus Google Search to verify (search the supplier's name + "brands carried" or visit their site if available). Be conservative — it is better to omit a brand than to guess. Do not invent brands.

Return only valid JSON in the exact shape requested. No markdown, no code fence, no commentary.`;

function buildPrompt(args: { supplier: SupplierForExtraction }): string {
  const s = args.supplier;
  return `Business name: ${s.name}
Website domain: ${s.domain ?? "(unknown)"}
Location: ${s.city}, ${s.state}
Categories tagged in our system: ${s.categoryIds.join(", ") || "(none)"}

Return JSON in this exact shape:
{
  "carries": [
    {
      "brand": "<canonical brand name, e.g. GAF, Sherwin-Williams, Trane>",
      "productType": "<concrete product category, e.g. Asphalt Shingles, Air Conditioner, Interior Latex Paint, PVC Pipe>",
      "categoryId": "<one of: ${args.supplier.categoryIds.join(" | ") || "(any of our standard category ids)"}>",
      "productLines": ["<specific product line if known, e.g. Timberline HDZ>", "..."]
    }
  ]
}

Rules:
- Up to 30 entries. Skip product lines if you don't have specific ones (use []).
- categoryId MUST be one of the tagged categories listed above. If none apply, skip the row.
- If you have no evidence of any brands, return {"carries": []}.
- No markdown, no code fence, no extra commentary — just the JSON object.`;
}

/** Strip a possible markdown code fence around a JSON blob. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : trimmed;
}

/** Heuristics to reject placeholder/bogus brand strings Gemini sometimes produces. */
function isBogusBrand(brand: string): boolean {
  const lower = brand.toLowerCase();
  if (brand.length < 2) return true;
  if (/^(no\s|generic|unknown|n\/a|various|misc)/i.test(lower)) return true;
  // Things like "No Brand (Treated Lumber)" or "Various (Tools)"
  if (/^[a-z\s]*\(/i.test(brand)) return true;
  return false;
}

function parseResponse(
  raw: string,
  validCategoryIds: Set<string>
): ExtractedCapability[] {
  const text = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const carriesRaw = (parsed as { carries?: unknown }).carries;
  if (!Array.isArray(carriesRaw)) return [];

  const out: ExtractedCapability[] = [];
  for (const item of carriesRaw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const brand = typeof obj.brand === "string" ? obj.brand.trim() : "";
    const productType =
      typeof obj.productType === "string" ? obj.productType.trim() : "";
    const categoryId =
      typeof obj.categoryId === "string" ? obj.categoryId.trim().toLowerCase() : "";
    if (!brand || !productType || !categoryId) continue;
    if (isBogusBrand(brand)) continue;
    if (!validCategoryIds.has(categoryId)) continue;
    const linesRaw = obj.productLines;
    const productLines = Array.isArray(linesRaw)
      ? linesRaw
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
    out.push({ brand, productType, categoryId, productLines });
  }
  return out;
}

export async function extractSupplierCapabilities(args: {
  supplier: SupplierForExtraction;
}): Promise<{
  capabilities: ExtractedCapability[];
  rawText: string;
  usage?: { input?: number; output?: number };
}> {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const validCategoryIds = new Set(args.supplier.categoryIds.map((c) => c.toLowerCase()));

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt({ supplier: args.supplier }) }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
      // Lower temperature → more consistent runs across the same supplier.
      // Not zero so Gemini still surfaces less-obvious brands.
      temperature: 0.3,
    },
  });

  const rawText = response.text ?? "";
  const capabilities = parseResponse(rawText, validCategoryIds);
  const usage = response.usageMetadata
    ? {
        input: response.usageMetadata.promptTokenCount,
        output: response.usageMetadata.candidatesTokenCount,
      }
    : undefined;

  return { capabilities, rawText, usage };
}
