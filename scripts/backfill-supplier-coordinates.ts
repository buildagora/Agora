/**
 * Backfill Supplier.latitude / Supplier.longitude via OpenStreetMap Nominatim (US).
 *
 * Strategy order per supplier:
 *   1. street, city, state zip (geocoded_address)
 *   2. name, city, state zip (store_name)
 *   3. city, state zip (city_centroid_fallback)
 *
 * Run:
 *   npx tsx scripts/backfill-supplier-coordinates.ts
 *   npm run backfill:supplier-coordinates
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPrisma } from "../src/lib/db.server";

const prisma = getPrisma();

const USER_AGENT = "AgoraLocalDev/1.0 (buildagora@gmail.com)";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const OUTPUT_DIR = join(process.cwd(), "scripts/output");

export type CoordinatePrecision =
  | "geocoded_address"
  | "store_name"
  | "city_centroid_fallback";

export type BackfillResult = {
  supplierId: string;
  name: string;
  status: "updated" | "skipped" | "failed";
  precision?: CoordinatePrecision;
  sourceQuery?: string;
  latitude?: number;
  longitude?: number;
  reason?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collapseWhitespace(s: string): string {
  return s.replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
}

/** Remove suite/unit noise and normalize the street line. */
function cleanStreetField(street: string): string {
  let t = collapseWhitespace(street);
  const segments = t
    .split(",")
    .map((p) => collapseWhitespace(p))
    .filter(
      (p) =>
        p.length > 0 &&
        !/^(?:Suite|Ste\.?|Unit|Warehouse)\b/i.test(p)
    );
  t = segments.join(", ");
  t = t.replace(/\s+(?:Suite|Ste\.?|Unit)\b[\s\S]*$/i, "").trim();
  return collapseWhitespace(t);
}

function buildAddressQuery(s: {
  street: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const streetPart = cleanStreetField(s.street ?? "");
  const cityPart = collapseWhitespace(s.city ?? "");
  const statePart = collapseWhitespace(s.state ?? "");
  const zipPart = collapseWhitespace(s.zip ?? "");
  const stateZip = [statePart, zipPart].filter(Boolean).join(" ");
  return [streetPart, cityPart, stateZip].filter(Boolean).join(", ");
}

function buildStoreNameQuery(s: {
  name: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const namePart = collapseWhitespace(s.name ?? "");
  const cityPart = collapseWhitespace(s.city ?? "");
  const statePart = collapseWhitespace(s.state ?? "");
  const zipPart = collapseWhitespace(s.zip ?? "");
  const stateZip = [statePart, zipPart].filter(Boolean).join(" ");
  return [namePart, cityPart, stateZip].filter(Boolean).join(", ");
}

function buildCityQuery(s: { city: string; state: string; zip: string }): string {
  const cityPart = collapseWhitespace(s.city ?? "");
  const statePart = collapseWhitespace(s.state ?? "");
  const zipPart = collapseWhitespace(s.zip ?? "");
  const stateZip = [statePart, zipPart].filter(Boolean).join(" ");
  return [cityPart, stateZip].filter(Boolean).join(", ");
}

async function geocodeUsAddress(
  q: string,
  retries = 3
): Promise<{ lat: number; lon: number } | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      q,
    });

    const url = `${NOMINATIM_SEARCH}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (res.status === 429) {
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error("Nominatim HTTP 429");
    }

    if (!res.ok) {
      throw new Error(`Nominatim HTTP ${res.status}`);
    }

    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    if (first.lat == null || first.lon == null) return null;

    const lat = Number.parseFloat(String(first.lat));
    const lon = Number.parseFloat(String(first.lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return { lat, lon };
  }

  return null;
}

export async function geocodeSupplierWithFallbacks(supplier: {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}): Promise<
  | { ok: true; lat: number; lon: number; precision: CoordinatePrecision; sourceQuery: string }
  | { ok: false; reason: string }
> {
  const attempts: Array<{ precision: CoordinatePrecision; query: string }> = [];

  const addressQ = buildAddressQuery(supplier);
  if (addressQ.trim()) {
    attempts.push({ precision: "geocoded_address", query: addressQ });
  }

  const storeQ = buildStoreNameQuery(supplier);
  if (storeQ.trim() && storeQ !== addressQ) {
    attempts.push({ precision: "store_name", query: storeQ });
  }

  const cityQ = buildCityQuery(supplier);
  if (cityQ.trim()) {
    attempts.push({ precision: "city_centroid_fallback", query: cityQ });
  }

  if (attempts.length === 0) {
    return { ok: false, reason: "empty_address" };
  }

  for (const attempt of attempts) {
    try {
      const coords = await geocodeUsAddress(attempt.query);
      if (coords) {
        return {
          ok: true,
          lat: coords.lat,
          lon: coords.lon,
          precision: attempt.precision,
          sourceQuery: attempt.query,
        };
      }
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { ok: false, reason: "no_geocode_result" };
}

export async function backfillMissingSupplierCoordinates(options?: {
  dryRun?: boolean;
}): Promise<{
  missingBefore: number;
  results: BackfillResult[];
}> {
  const suppliers = await prisma.supplier.findMany({
    where: {
      OR: [{ latitude: null }, { longitude: null }],
    },
    orderBy: { name: "asc" },
  });

  const results: BackfillResult[] = [];

  for (let i = 0; i < suppliers.length; i++) {
    if (i > 0) await sleep(1500);

    const supplier = suppliers[i];
    const geocoded = await geocodeSupplierWithFallbacks(supplier);

    if (!geocoded.ok) {
      results.push({
        supplierId: supplier.id,
        name: supplier.name,
        status: geocoded.reason === "empty_address" ? "skipped" : "failed",
        reason: geocoded.reason,
      });
      continue;
    }

    if (!options?.dryRun) {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          latitude: geocoded.lat,
          longitude: geocoded.lon,
        },
      });
    }

    results.push({
      supplierId: supplier.id,
      name: supplier.name,
      status: "updated",
      precision: geocoded.precision,
      sourceQuery: geocoded.sourceQuery,
      latitude: geocoded.lat,
      longitude: geocoded.lon,
    });
  }

  return { missingBefore: suppliers.length, results };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    dryRun
      ? "Dry run — no DB writes.\n"
      : "Backfilling missing supplier coordinates…\n"
  );

  const { missingBefore, results } = await backfillMissingSupplierCoordinates({
    dryRun,
  });

  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  await mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(OUTPUT_DIR, `supplier-coordinate-backfill-${stamp}.json`);
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        missingBefore,
        updated,
        skipped,
        failed,
        stillMissing: failed + skipped,
        results,
      },
      null,
      2
    )
  );

  for (const r of results) {
    if (r.status === "updated") {
      console.log(
        `[ok] ${r.supplierId} → ${r.latitude}, ${r.longitude} (${r.precision})`
      );
    } else {
      console.warn(`[${r.status}] ${r.supplierId} — ${r.reason ?? "unknown"}`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Missing before: ${missingBefore}`);
  console.log(`Updated:        ${updated}`);
  console.log(`Skipped:        ${skipped}`);
  console.log(`Failed:         ${failed}`);
  console.log(`Still missing:  ${failed + skipped}`);
  console.log(`Report:         ${outPath}`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
