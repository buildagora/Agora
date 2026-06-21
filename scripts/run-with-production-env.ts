/**
 * Run a command with production env loaded exclusively from .env.production.local.
 *
 * Usage:
 *   npx tsx scripts/run-with-production-env.ts -- npx prisma migrate status
 *   npm run prod:db:status
 */
import { spawnSync } from "node:child_process";
import {
  loadProductionEnv,
  printProductionEnvTarget,
} from "./lib/loadProductionEnv";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");

if (sep < 0 || sep === argv.length - 1) {
  console.error(
    "Usage: tsx scripts/run-with-production-env.ts [--require-neon] -- <command...>"
  );
  process.exit(1);
}

const flags = argv.slice(0, sep);
const command = argv.slice(sep + 1);
const requireNeon = flags.includes("--require-neon");

try {
  const target = loadProductionEnv({ requireNeon });
  printProductionEnvTarget(target);
  console.log("");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(result.status ?? 1);
