export function getSerpApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;

  if (!key) {
    throw new Error("Missing SERPAPI_API_KEY");
  }

  return key;
}

export function getConstructorApiKey(envVarName: string): string {
  const key = process.env[envVarName];

  if (!key) {
    throw new Error(`Missing ${envVarName}`);
  }

  return key;
}
