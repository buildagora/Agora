/**
 * Cheap Gemini call that maps a free-text supply query to one of our
 * canonical category ids (or null when it doesn't cleanly fit).
 *
 * Used by runSearch to gate capability matches by category — without this,
 * a query like "2x4 Southern Yellow Pine Lumber" matches landscaping
 * suppliers (Pine → Pinestraw), paint suppliers (Wood → Paint Grade Wood),
 * etc., because `searchCapabilities` does substring matching against every
 * field of every row.
 *
 * No grounding, ~5-10 output tokens, ~500ms per call. Cheap enough to do
 * on every search.
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

/** Canonical lowercase category ids — keep in sync with the Supplier rows we seeded. */
export const KNOWN_CATEGORY_IDS = [
  "brick",
  "cabinets_countertops",
  "concrete_cement",
  "decking_railing",
  "drywall",
  "electrical",
  "fencing",
  "flooring",
  "glass_glazing",
  "gutter_drainage",
  "hardware_fasteners",
  "home_improvement",
  "hvac",
  "insulation",
  "landscaping",
  "lumber_siding",
  "paint",
  "plumbing",
  "roofing",
  "steel_metal",
  "tile_stone",
  "tools_equipment",
  "windows_doors",
] as const;

export type KnownCategoryId = (typeof KNOWN_CATEGORY_IDS)[number];

const VALID_SET = new Set<string>(KNOWN_CATEGORY_IDS);

const SYSTEM_INSTRUCTION = `You classify a US construction-supply query into a single canonical category. Reply with ONLY the category id (e.g., "lumber_siding") or "unknown". No quotes, no markdown, no extra text.`;

function buildPrompt(query: string): string {
  return `Categories (reply with exactly one of these or "unknown"):
${KNOWN_CATEGORY_IDS.join(", ")}

Examples:
  "2x4 Southern Yellow Pine lumber"     → lumber_siding
  "GAF Timberline HDZ shingles"          → roofing
  "Sherwin-Williams interior latex"      → paint
  "PVC pipe and fittings"                → plumbing
  "Trane 3-ton heat pump"                → hvac
  "kitchen cabinets oak"                 → cabinets_countertops
  "circular saw blade"                   → tools_equipment

Query: ${query}

Answer:`;
}

function normalize(raw: string): KnownCategoryId | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .trim();
  if (!cleaned) return null;
  if (VALID_SET.has(cleaned)) return cleaned as KnownCategoryId;
  return null;
}

export async function classifyQueryToCategory(
  query: string
): Promise<KnownCategoryId | null> {
  const q = query.trim();
  if (!q) return null;

  const ai = getClient();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: buildPrompt(q) }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0, // deterministic single-token answer
      },
    });
    return normalize(response.text ?? "");
  } catch (err: any) {
    // Don't fail the whole search on classifier errors — just unfiltered.
    console.error("[classifyQuery] failed:", err?.message ?? err);
    return null;
  }
}
