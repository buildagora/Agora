/**
 * Apply documented supplier coordinate + domain patches (dev/local data quality).
 *
 * Only patch when a real store/business address is verified. Do not use city centroids.
 *
 *   npm run patch:supplier-coordinates          # dry-run
 *   npm run patch:supplier-coordinates -- --apply
 *   npm run patch:supplier-coordinates -- --apply --supplier-id floor_decor_hsv
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { fileURLToPath } from "node:url";

import { getPrisma } from "../src/lib/db.server";

export type CoordinatePrecision =
  | "verified_store_address"
  | "verified_business_address"
  | "verified_supplier_store_locator"
  | "existing_seed_address"
  | "unresolved_missing_address";

export type CoordinatePatch = {
  supplierId: string;
  latitude: number;
  longitude: number;
  /** Human-readable provenance for audits and code review. */
  source: string;
  precision: CoordinatePrecision;
};

export type DomainPatch = {
  supplierId: string;
  domain: string;
  source: string;
};

/**
 * Documented patches — add entries here; do not silently hardcode without source.
 */
export const SUPPLIER_COORDINATE_PATCHES: CoordinatePatch[] = [
  // Phase 7A — Floor & Decor (verified store address via OSM geocode of seed/locator address)
  {
    supplierId: "floor_decor_hsv",
    latitude: 34.7538093,
    longitude: -86.7422612,
    precision: "verified_store_address",
    source:
      "Floor & Decor store at 7830 Highway 72 West Suite 300, Madison, AL 35758 (same as floor_decor_madison); OSM geocode queried 2026-06-04.",
  },
  {
    supplierId: "floor_decor_madison",
    latitude: 34.7538093,
    longitude: -86.7422612,
    precision: "verified_store_address",
    source: "Same physical store as floor_decor_hsv — 7830 Highway 72 West Suite 300, Madison, AL 35758.",
  },

  // Phase 7B.3 — replace 7B.1 city-centroid backfills
  {
    supplierId: "angel_tile_stone",
    latitude: 34.689198,
    longitude: -86.506612,
    precision: "verified_business_address",
    source:
      "Angel Tile & Stone showroom 5566 US-431, Brownsboro, AL 35741 — Nextdoor business listing + angeltileandstone.com (2026-06-05).",
  },
  {
    supplierId: "carpet_one_hsv",
    latitude: 34.764977,
    longitude: -86.588646,
    precision: "verified_business_address",
    source:
      "Carpet One Floor & Home 3107 Memorial Pkwy NW, Huntsville, AL 35810 — carpetonehuntsville.com + timetoopen.com GPS (2026-06-05).",
  },
  {
    supplierId: "case_discount_hsv",
    latitude: 34.73723,
    longitude: -86.6171325,
    precision: "verified_business_address",
    source:
      "Case Discount Flooring warehouse 1011 Oster Dr NW Suite A1, Huntsville, AL 35816 — HMC builders guide + whereorg property GPS (2026-06-05).",
  },
  {
    supplierId: "ceramic_harmony",
    latitude: 34.6327971,
    longitude: -86.5657089,
    precision: "verified_business_address",
    source:
      "Ceramic Harmony 11317 South Memorial Pkwy, Huntsville, AL 35803 — ceramicharmony.com + Google Places schema via opengovny (2026-06-05).",
  },
  {
    supplierId: "daltile_hsv",
    latitude: 34.77786,
    longitude: -86.65775,
    precision: "verified_supplier_store_locator",
    source:
      "Daltile Sales Service Center 3603 Jack Kendall Way NW, Huntsville, AL 35806 — locations.daltile.com/al/huntsville/4001; adjacent parcel CompStak 3610 Jack Kendall (2026-06-05).",
  },
  {
    supplierId: "general_shale_hsv",
    latitude: 34.7534596,
    longitude: -86.7103943,
    precision: "verified_business_address",
    source:
      "General Shale Brick showroom 7029 Highway 72 West, Huntsville, AL 35806 — generalshalebrickhuntsville.com + openingtimes.co map pin (2026-06-05).",
  },
  {
    supplierId: "home_depot_madison",
    latitude: 34.757374,
    longitude: -86.739203,
    precision: "verified_supplier_store_locator",
    source:
      "Home Depot West Huntsville store #803 at 4045 Lawson Ridge Dr, Madison, AL 35757 — homedepot.com/l/West-Huntsville/AL/Madison/35757/803 Bing map embed (2026-06-05). NOTE: seed street 8580 Hwy 72 W is stale (that address is Walmart); physical store is Lawson Ridge.",
  },

  // Phase 7B.3 — 11 suppliers still missing after Nominatim 429 backfill
  {
    supplierId: "home_depot_west_hsv",
    latitude: 34.757374,
    longitude: -86.739203,
    precision: "verified_supplier_store_locator",
    source:
      "Home Depot West Huntsville store #803, 4045 Lawson Ridge Dr, Madison, AL 35757 — homedepot.com store locator Bing map 34.757374,-86.739203 (2026-06-05).",
  },
  {
    supplierId: "lowes_hsv",
    latitude: 34.6335095,
    longitude: -86.5670804,
    precision: "verified_supplier_store_locator",
    source:
      "Lowe's store #0411, 10050 S Memorial Pkwy, Huntsville, AL 35803 — lowes.com/store/AL-Huntsville/0411 + MerchantCircle listing (2026-06-05).",
  },
  {
    supplierId: "lowes_madison_hsv",
    latitude: 34.7547,
    longitude: -86.746805,
    precision: "verified_supplier_store_locator",
    source:
      "Lowe's store #0663, 7920 Highway 72 West, Madison, AL 35758 — lowes.com/store/AL-Madison/0663 + MerchantCircle listing (2026-06-05).",
  },
  {
    supplierId: "mcneese_glass",
    latitude: 34.746696,
    longitude: -86.582764,
    precision: "verified_business_address",
    source:
      "McNeese Glass Co 130 Neeley Ave NE, Huntsville, AL 35801 — mcneeseglass.com + BBB + whereorg GPS (2026-06-05).",
  },
  {
    supplierId: "northern_tool_hsv",
    latitude: 34.70204,
    longitude: -86.68987,
    precision: "verified_supplier_store_locator",
    source:
      "Northern Tool + Equipment 7252 Governors West NW, Huntsville, AL 35806 — northerntool.com/store/huntsvilleal + ScrapeHero 2024 store list (2026-06-05).",
  },
  {
    supplierId: "quality_metal_hsv",
    latitude: 34.6906626,
    longitude: -86.6032431,
    precision: "existing_seed_address",
    source:
      "4210 W Schrimsher Ln SW, Huntsville, AL 35805 — same address/coords as quality_metal_roofing_hsv in prisma/seed/agora-suppliers.sql export.",
  },
  {
    supplierId: "summertown_metals_tn",
    latitude: 35.440767,
    longitude: -87.333653,
    precision: "verified_business_address",
    source:
      "Summertown Metals 3864 Summertown Hwy, Summertown, TN 38483 — summertownmetals.com + BBB LocalBusiness schema GeoCoordinates (2026-06-05).",
  },
  {
    supplierId: "sunbelt_glass",
    latitude: 34.7133826,
    longitude: -86.6095439,
    precision: "verified_business_address",
    source:
      "Sunbelt Glass Huntsville office 2604 SW Triana Blvd, Huntsville, AL 35805 — sunbeltglassllc.com contact page + property GPS at address (2026-06-05).",
  },
  {
    supplierId: "tile_liquidators_ocr",
    latitude: 34.6066178,
    longitude: -86.4582386,
    precision: "existing_seed_address",
    source:
      "6800 US 431 S, Owens Cross Roads, AL 35763 — same store as tile_liquidators in prisma/seed/agora-suppliers.sql (tileliquidators.net).",
  },
  {
    supplierId: "tractor_supply_madison",
    latitude: 34.750812,
    longitude: -86.776121,
    precision: "verified_supplier_store_locator",
    source:
      "Tractor Supply store #2412, 5531 Promenade Point Parkway NW, Huntsville/Madison, AL 35758 — tractorsupply.com/tsc/store_Huntsville-AL-35758_2412 + Nextdoor GPS (2026-06-05). NOTE: seed street 1006 Highway 72 W is stale.",
  },
  {
    supplierId: "trane_supply_hsv",
    latitude: 34.6619567,
    longitude: -86.7730331,
    precision: "verified_supplier_store_locator",
    source:
      "Trane Supply 301 James Record Rd SW Bldg 200 Ste 100, Huntsville, AL 35824 — tranesupply.com store locator + Google Maps/Birdeye place pin (2026-06-05).",
  },
];

/** Domain patches — restores router/live-evidence prerequisites. */
export const SUPPLIER_DOMAIN_PATCHES: DomainPatch[] = [
  {
    supplierId: "abc_supply_hsv",
    domain: "abcsupply.com",
    source:
      "ABC Supply canonical domain — fingerprint shadow report + PROVEN_V1_DOMAIN_OVERRIDES; seed export had domain NULL incorrectly.",
  },
];

type CliArgs = {
  apply: boolean;
  supplierId?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--apply") args.apply = true;
    else if (token === "--supplier-id") args.supplierId = argv[++i];
  }
  return args;
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv);
  const coordPatches = args.supplierId
    ? SUPPLIER_COORDINATE_PATCHES.filter((p) => p.supplierId === args.supplierId)
    : SUPPLIER_COORDINATE_PATCHES;
  const domainPatches = args.supplierId
    ? SUPPLIER_DOMAIN_PATCHES.filter((p) => p.supplierId === args.supplierId)
    : SUPPLIER_DOMAIN_PATCHES;

  if (coordPatches.length === 0 && domainPatches.length === 0) {
    console.error(
      args.supplierId
        ? `No patch defined for supplierId=${args.supplierId}`
        : "No patches defined."
    );
    process.exit(1);
  }

  const prisma = getPrisma();
  console.log(args.apply ? "Applying patches…\n" : "Dry run (pass --apply to write)…\n");

  for (const patch of coordPatches) {
    const existing = await prisma.supplier.findUnique({
      where: { id: patch.supplierId },
      select: {
        id: true,
        name: true,
        street: true,
        city: true,
        state: true,
        zip: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!existing) {
      console.warn(`[skip] Unknown supplier: ${patch.supplierId}`);
      continue;
    }

    const address = [existing.street, existing.city, existing.state, existing.zip]
      .filter(Boolean)
      .join(", ");

    console.log(`[coord:${patch.supplierId}] ${existing.name}`);
    console.log(`  address: ${address}`);
    console.log(`  current: ${existing.latitude ?? "null"}, ${existing.longitude ?? "null"}`);
    console.log(`  patch:   ${patch.latitude}, ${patch.longitude} (${patch.precision})`);
    console.log(`  source:  ${patch.source}`);

    if (args.apply) {
      await prisma.supplier.update({
        where: { id: patch.supplierId },
        data: {
          latitude: patch.latitude,
          longitude: patch.longitude,
        },
      });
      console.log("  status:  updated");
    } else {
      console.log("  status:  dry-run");
    }
    console.log("");
  }

  for (const patch of domainPatches) {
    const existing = await prisma.supplier.findUnique({
      where: { id: patch.supplierId },
      select: { id: true, name: true, domain: true },
    });

    if (!existing) {
      console.warn(`[skip] Unknown supplier: ${patch.supplierId}`);
      continue;
    }

    const domain = normalizeDomain(patch.domain);
    console.log(`[domain:${patch.supplierId}] ${existing.name}`);
    console.log(`  current: ${existing.domain ?? "null"}`);
    console.log(`  patch:   ${domain}`);
    console.log(`  source:  ${patch.source}`);

    if (args.apply) {
      await prisma.supplier.update({
        where: { id: patch.supplierId },
        data: { domain },
      });
      console.log("  status:  updated");
    } else {
      console.log("  status:  dry-run");
    }
    console.log("");
  }
}

const isMainModule =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
