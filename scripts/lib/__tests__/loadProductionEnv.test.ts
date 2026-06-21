import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadProductionEnv,
  parseEnvFile,
} from "../loadProductionEnv";

console.log("\nloadProductionEnv tests\n");

const dir = mkdtempSync(join(tmpdir(), "agora-prod-env-"));
const envFile = join(dir, ".env.production.local");

try {
  writeFileSync(
    envFile,
    [
      "DATABASE_URL=postgresql://user:pass@ep-test.neon.tech:5432/neondb?sslmode=require",
      "DIRECT_URL=postgresql://user:pass@ep-test.neon.tech:5432/neondb?sslmode=require",
    ].join("\n")
  );

  process.env.DATABASE_URL = "postgresql://peyton:agora_dev@localhost:5433/agora_local";

  const target = loadProductionEnv({ envFile, requireNeon: true });
  assert.equal(target.host, "ep-test.neon.tech");
  assert.equal(target.database, "neondb");
  assert.equal(process.env.DATABASE_URL?.includes("neon.tech"), true);
  assert.equal(process.env.AGORA_ENV_FILE, envFile);
  assert.notEqual(
    process.env.DATABASE_URL?.includes("localhost"),
    true,
    "localhost must be overridden"
  );

  writeFileSync(
    envFile,
    "DATABASE_URL=postgresql://user:pass@localhost:5433/agora_local\n"
  );
  delete process.env.AGORA_ENV_FILE;

  let threw = false;
  try {
    loadProductionEnv({ envFile });
  } catch (err) {
    threw = true;
    assert.match(
      err instanceof Error ? err.message : String(err),
      /Refusing production command/i
    );
  }
  assert.equal(threw, true, "localhost must be rejected");

  const parsed = parseEnvFile(envFile);
  assert.equal(parsed.DATABASE_URL?.includes("localhost"), true);

  console.log("All loadProductionEnv tests passed.\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
