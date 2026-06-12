/**
 * Router smoke test — verifies fingerprint router is active using the same
 * discovery entry point as local dev (`searchSupplierDiscoveryForSupplier`).
 *
 *   npm run fingerprint:router-smoke
 *   npx tsx scripts/fingerprint/router-smoke-test.ts --supplier-id wittichen_hsv
 *
 * Expects router flags in `.env.local` (does not override them).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPrisma } from "../../src/lib/db.server";
import { searchSupplierDiscoveryForSupplier } from "../../src/lib/suppliers/resolveSupplierDiscovery";
import {
  getFingerprintRouterAllowlist,
  getFingerprintRouterExecutionTimeoutMs,
  isFingerprintRouterEnabled,
  isFingerprintRouterShadowEnabled,
  isSupplierAllowlisted,
} from "../../src/lib/suppliers/routing/routerFlags";
import type { SupplierExtractionRouteEvent } from "../../src/lib/suppliers/routing/routerTelemetry";
import {
  PROVEN_V1_COHORT,
  PROVEN_V1_DOMAIN_OVERRIDES,
  PROVEN_V1_QUERY_MATRIX,
  type ProvenV1SupplierId,
} from "./phase6bProvenCohortParity";

type CliArgs = {
  supplierId?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--supplier-id") args.supplierId = argv[++i];
  }
  return args;
}

function createRouteEventCapture(): {
  events: SupplierExtractionRouteEvent[];
  restore: () => void;
} {
  const events: SupplierExtractionRouteEvent[] = [];
  const originalInfo = console.info.bind(console);
  console.info = (...logArgs: unknown[]) => {
    for (const arg of logArgs) {
      if (typeof arg === "string" && arg.includes("supplier_extraction_route")) {
        try {
          events.push(JSON.parse(arg) as SupplierExtractionRouteEvent);
        } catch {
          /* ignore non-json logs */
        }
      }
    }
    originalInfo(...logArgs);
  };
  return {
    events,
    restore: () => {
      console.info = originalInfo;
    },
  };
}

function printEnvStatus(): void {
  const allowlist = [...getFingerprintRouterAllowlist()];
  console.log("\n=== Router environment (.env.local) ===");
  console.log(`FINGERPRINT_ROUTER_ENABLED=${process.env.FINGERPRINT_ROUTER_ENABLED ?? "(unset)"} → ${isFingerprintRouterEnabled()}`);
  console.log(`FINGERPRINT_ROUTER_SHADOW=${process.env.FINGERPRINT_ROUTER_SHADOW ?? "(unset)"} → ${isFingerprintRouterShadowEnabled()}`);
  console.log(`FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST=${process.env.FINGERPRINT_ROUTER_SUPPLIER_ALLOWLIST ?? "(unset)"}`);
  console.log(`FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS=${process.env.FINGERPRINT_ROUTER_EXECUTION_TIMEOUT_MS ?? "(default)"} → ${getFingerprintRouterExecutionTimeoutMs()}ms`);
  console.log(`Allowlist size: ${allowlist.length}`);
  if (allowlist.length > 0) {
    console.log(`Allowlisted: ${allowlist.join(", ")}`);
  }

  const missingFromAllowlist = PROVEN_V1_COHORT.filter((id) => !isSupplierAllowlisted(id));
  if (!isFingerprintRouterEnabled()) {
    console.warn("\n⚠ FINGERPRINT_ROUTER_ENABLED is not true — chain will not execute; expect executionPath=legacy.");
  }
  if (missingFromAllowlist.length > 0) {
    console.warn(`\n⚠ Proven-v1 suppliers missing from allowlist: ${missingFromAllowlist.join(", ")}`);
  }
}

async function resolveDbDomain(supplierId: ProvenV1SupplierId): Promise<string | null> {
  const override = PROVEN_V1_DOMAIN_OVERRIDES[supplierId];
  if (override) return override;

  const prisma = getPrisma();
  const row = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { domain: true },
  });
  return row?.domain ?? null;
}

async function smokeSupplier(supplierId: ProvenV1SupplierId): Promise<void> {
  const query = PROVEN_V1_QUERY_MATRIX[supplierId][0];
  const dbDomain = await resolveDbDomain(supplierId);
  const capture = createRouteEventCapture();
  const start = Date.now();

  let resultCount = 0;
  try {
    const results = await searchSupplierDiscoveryForSupplier(supplierId, query, dbDomain);
    resultCount = results.length;
  } finally {
    const elapsedMs = Date.now() - start;
    capture.restore();
    const route = capture.events[capture.events.length - 1];

    console.log("\n---");
    console.log(`supplierId: ${supplierId}`);
    console.log(`query: "${query}"`);
    console.log(`dbDomain: ${dbDomain ?? "(null)"}`);
    console.log(`allowlisted: ${isSupplierAllowlisted(supplierId)}`);
    console.log(`elapsedMs: ${elapsedMs}`);
    if (!route) {
      console.log("executionPath: (no telemetry — router flags likely off)");
      console.log(`resultCount: ${resultCount}`);
      return;
    }

    console.log(`executionPath: ${route.executionPath}`);
    console.log(`primaryStrategy: ${route.primaryStrategy ?? "(none)"}`);
    console.log(`finalStrategyUsed: ${route.finalStrategyUsed ?? "(none)"}`);
    console.log(`fallbackDepth: ${route.fallbackDepth}`);
    console.log(`chainExhausted: ${route.chainExhausted}`);
    console.log(`resultCount: ${resultCount}`);
    if (route.fallbackReason) {
      console.log(`fallbackReason: ${route.fallbackReason}`);
    }
    if (route.explanation) {
      console.log(`explanation: ${route.explanation}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  printEnvStatus();

  const cohort = args.supplierId
    ? PROVEN_V1_COHORT.filter((id) => id === args.supplierId)
    : [...PROVEN_V1_COHORT];

  if (cohort.length === 0) {
    console.error(`Unknown or invalid --supplier-id: ${args.supplierId}`);
    process.exit(1);
  }

  console.log("\n=== Router smoke test (searchSupplierDiscoveryForSupplier) ===");
  for (const supplierId of cohort) {
    await smokeSupplier(supplierId);
  }

  console.log("\nDone. Watch dev-server stdout for `supplier_extraction_route` during UI tests.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrisma();
    await prisma.$disconnect();
  });
