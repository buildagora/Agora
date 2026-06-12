export function getOptionalEnv(envVarName: string | undefined): string | null {
  if (!envVarName) return null;
  const value = process.env[envVarName]?.trim();
  return value || null;
}

export function getRequiredEnv(envVarName: string): string {
  const value = process.env[envVarName]?.trim();
  if (!value) {
    throw new Error(`Missing ${envVarName}`);
  }
  return value;
}

export function resolveConfigValue(
  direct: string | undefined,
  envVarName: string | undefined
): string | null {
  if (direct?.trim()) return direct.trim();
  return getOptionalEnv(envVarName);
}
