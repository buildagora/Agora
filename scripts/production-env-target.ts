/**
 * Print the production DATABASE_URL target (host/db only — no secrets).
 *
 *   npm run prod:env:target
 */
import {
  loadProductionEnv,
  printProductionEnvTarget,
} from "./lib/loadProductionEnv";

const requireNeon = process.argv.includes("--require-neon");

try {
  const target = loadProductionEnv({ requireNeon });
  printProductionEnvTarget(target);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
