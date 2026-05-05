export function getSerpApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;

  if (!key) {
    throw new Error("Missing SERPAPI_API_KEY");
  }

  return key;
}
