/**
 * Backfill Supplier.latitude / Supplier.longitude via OpenStreetMap Nominatim (US).
 *
 * Run: npx tsx scripts/backfill-supplier-coordinates.ts
 */

import { getPrisma } from "../src/lib/db.server";

const prisma = getPrisma();

const USER_AGENT = "AgoraLocalDev/1.0 (buildagora@gmail.com)";
const NOMINATIM_SEARCH =
  "https://nominatim.openstreetmap.org/search";

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

/**
 * Final geocoder query: `street, city, state zip`
 * (comma after street and city; state and zip together in the last segment).
 */
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
  const parts = [streetPart, cityPart, stateZip].filter(Boolean);
  return parts.join(", ");
}

async function geocodeUsAddress(q: string): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "us",
    q,
  });

  const url = `${NOMINATIM_SEARCH}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  if (first.lat == null || first.lon == null) {
    return null;
  }

  const lat = Number.parseFloat(String(first.lat));
  const lon = Number.parseFloat(String(first.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

async function main() {
  const suppliers = await prisma.supplier.findMany({
    where: {
      OR: [{ latitude: null }, { longitude: null }],
    },
    orderBy: { name: "asc" },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Found ${suppliers.length} supplier(s) missing latitude and/or longitude.\n`
  );

  for (let i = 0; i < suppliers.length; i++) {
    if (i > 0) {
      await sleep(1000);
    }

    const supplier = suppliers[i];
    const q = buildAddressQuery(supplier);

    if (!q.trim()) {
      console.warn(
        `[skip] Empty address — id=${supplier.id} name="${supplier.name}"`
      );
      skipped++;
      continue;
    }

    try {
      const coords = await geocodeUsAddress(q);

      if (!coords) {
        console.warn(
          `[fail] No geocode result — name="${supplier.name}" address="${q}"`
        );
        failed++;
        continue;
      }

      await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          latitude: coords.lat,
          longitude: coords.lon,
        },
      });

      updated++;
      console.log(`[ok] ${supplier.name} → ${coords.lat}, ${coords.lon}`);
    } catch (err) {
      failed++;
      console.warn(
        `[fail] ${supplier.name} — address="${q}" — ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const totalChecked = suppliers.length;

  console.log("\n--- Summary ---");
  console.log(`Total checked: ${totalChecked}`);
  console.log(`Updated:       ${updated}`);
  console.log(`Skipped:       ${skipped}`);
  console.log(`Failed:        ${failed}`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
