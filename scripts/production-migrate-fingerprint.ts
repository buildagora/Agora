/**
 * Apply pending Prisma migrations to production Neon (non-destructive: migrate deploy only).
 *
 *   npm run prod:db:migrate
 */
import { spawnSync } from "node:child_process";
import {
  loadProductionEnv,
  printProductionEnvTarget,
} from "./lib/loadProductionEnv";

const target = loadProductionEnv({ requireNeon: true });
printProductionEnvTarget(target);
console.log("");
console.log("Running: npx prisma migrate deploy");
console.log("");

const status = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

if (status.status !== 0) {
  process.exit(status.status ?? 1);
}

console.log("");
console.log("Migration deploy finished. Verify with: npm run prod:fingerprint:check");
