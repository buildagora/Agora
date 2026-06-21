/**
 * Load DATABASE_URL (and optional DIRECT_URL) exclusively from .env.production.local.
 *
 * Why: `prisma.config.ts` and shell env often still carry `.env.local`, so
 * `dotenv_config_path=.env.production.local` is not enough on its own.
 *
 * Sets process.env.AGORA_ENV_FILE so prisma.config.ts loads the same file.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_PRODUCTION_ENV_FILE = ".env.production.local";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export type ProductionEnvTarget = {
  envFile: string;
  host: string;
  port: string;
  database: string;
  urlHash: string;
  isNeon: boolean;
  databaseUrl: string;
  directUrl?: string;
};

/** Parse KEY=VALUE lines from a dotenv file (no variable expansion). */
export function parseEnvFile(filePath: string): Record<string, string> {
  const raw = readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function fingerprintUrl(databaseUrl: string): {
  host: string;
  port: string;
  database: string;
  urlHash: string;
  isNeon: boolean;
} {
  const url = new URL(databaseUrl);
  const host = url.hostname;
  return {
    host,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, "").split("?")[0],
    urlHash: createHash("sha256").update(databaseUrl).digest("hex").slice(0, 10),
    isNeon: host.includes("neon.tech"),
  };
}

export type LoadProductionEnvOptions = {
  envFile?: string;
  /** When true (default), refuse localhost / 127.0.0.1 targets. */
  rejectLocalhost?: boolean;
  /** When true, refuse hosts that do not look like Neon. */
  requireNeon?: boolean;
};

/**
 * Load production env into process.env and return a safe target summary.
 * Does not print secrets.
 */
export function loadProductionEnv(
  options: LoadProductionEnvOptions = {}
): ProductionEnvTarget {
  const envFile = resolve(
    process.cwd(),
    options.envFile ?? DEFAULT_PRODUCTION_ENV_FILE
  );
  const rejectLocalhost = options.rejectLocalhost !== false;
  const requireNeon = options.requireNeon === true;

  if (!existsSync(envFile)) {
    throw new Error(
      `Production env file not found: ${envFile}\n` +
        "Create .env.production.local with DATABASE_URL for Neon."
    );
  }

  const parsed = parseEnvFile(envFile);
  const databaseUrl = parsed.DATABASE_URL?.trim();
  const directUrl = parsed.DIRECT_URL?.trim();

  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is missing in ${envFile}`);
  }

  const fp = fingerprintUrl(databaseUrl);

  if (rejectLocalhost && LOCALHOST_HOSTS.has(fp.host)) {
    throw new Error(
      `Refusing production command: DATABASE_URL host is "${fp.host}" (${envFile}).\n` +
        "Point .env.production.local at Neon, not localhost."
    );
  }

  if (requireNeon && !fp.isNeon) {
    throw new Error(
      `Refusing production command: DATABASE_URL host "${fp.host}" is not Neon.\n` +
        "Expected a *.neon.tech host in .env.production.local."
    );
  }

  // Exclusive production URLs — override any .env.local values already in process.env.
  process.env.AGORA_ENV_FILE = envFile;
  process.env.DATABASE_URL = databaseUrl;
  if (directUrl) {
    process.env.DIRECT_URL = directUrl;
  } else {
    delete process.env.DIRECT_URL;
  }

  return {
    envFile,
    ...fp,
    databaseUrl,
    directUrl,
  };
}

export function formatProductionEnvTarget(target: ProductionEnvTarget): string {
  return [
    "Production database target:",
    `  env file : ${target.envFile}`,
    `  host     : ${target.host}`,
    `  port     : ${target.port}`,
    `  database : ${target.database}`,
    `  url hash : ${target.urlHash}`,
    `  neon     : ${target.isNeon ? "yes" : "no"}`,
    `  direct   : ${target.directUrl ? "DIRECT_URL set" : "DATABASE_URL only"}`,
  ].join("\n");
}

export function printProductionEnvTarget(target: ProductionEnvTarget): void {
  console.log(formatProductionEnvTarget(target));
}
