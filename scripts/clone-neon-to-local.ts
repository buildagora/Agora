/**
 * Clone the current Neon branch into the local Postgres dev mirror.
 *
 * Reads NEON_DATABASE_URL (source) and DATABASE_URL (target) from .env.local.
 *
 * Strategy: spawn a one-off postgres:17 container that has matching pg_dump
 * and pg_restore. This avoids needing postgresql-client-17 installed on the
 * host (Ubuntu typically ships 16). Uses --network host so the container
 * can reach both Neon (TCP out) and the agora-pg container on localhost:5433.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/clone-neon-to-local.ts dotenv_config_path=.env.local
 */

import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const sourceUrl = process.env.NEON_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error("Set NEON_DATABASE_URL (source) in .env.local");
  process.exit(1);
}
if (!targetUrl) {
  console.error("Set DATABASE_URL (local target) in .env.local");
  process.exit(1);
}
if (sourceUrl === targetUrl) {
  console.error(
    "NEON_DATABASE_URL and DATABASE_URL are identical. Aborting to avoid clobbering the source."
  );
  process.exit(1);
}
if (!targetUrl.includes("localhost") && !targetUrl.includes("127.0.0.1")) {
  console.error(
    "DATABASE_URL must point at localhost for safety. Refusing to clone into a remote DB."
  );
  process.exit(1);
}

const shellScript = `set -e
echo '[clone] pg_dump from Neon → /tmp/neon.dump'
pg_dump --format=custom --no-owner --no-privileges --file /tmp/neon.dump "$SOURCE_URL"
echo '[clone] pg_restore /tmp/neon.dump → local'
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TARGET_URL" /tmp/neon.dump || true
echo '[clone] done'`;

console.log("[clone] launching postgres:17 container with --network host");
const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    "host",
    "-e",
    `SOURCE_URL=${sourceUrl}`,
    "-e",
    `TARGET_URL=${targetUrl}`,
    "postgres:17",
    "sh",
    "-c",
    shellScript,
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error(`[clone] docker run exited with ${result.status}`);
  process.exit(result.status ?? 1);
}
