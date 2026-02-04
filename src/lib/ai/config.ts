/**
 * AI Configuration
 * Checks if OpenAI is configured and returns config if available
 */

export interface AIConfig {
  apiKey: string;
  model: string;
}

export type AIConfigResult =
  | {
      ok: true;
      config: AIConfig;
    }
  | {
      ok: false;
      error: string;
    };

export function getAIConfig(): AIConfigResult {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return {
      ok: false,
      error: "OPENAI_API_KEY not configured",
    };
  }

  return {
    ok: true,
    config: {
      apiKey,
      model,
    },
  };
}

