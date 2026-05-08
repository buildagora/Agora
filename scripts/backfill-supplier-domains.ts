import { getPrisma } from "../src/lib/db.server";

const SUPPLIER_DOMAINS: Record<string, string> = {
  // Local verified domains not yet in prod
  "84_lumber_mad": "84lumber.com",
  "acme_brick_madison": "acmebrick.com",
  "baker_hsv": "bakerdist.com",
  "bfs_hsv": "bldr.com",
  "ecmd_hsv": "ecmd.com",
  "ferguson_hvac_hsv": "ferguson.com",
  "general_shale_hsv": "generalshale.com",
  "grainger_hsv": "grainger.com",
  "gulfeagle_hsv": "gulfeaglesupply.com",
  "johnstone_hsv": "johnstonesupply.com",
  "lansing_hsv": "lansingbp.com",
  "lennox_hsv": "lennoxpros.com",
  "ma_supply_hsv": "masupply.com",
  "mingledorffs_hsv": "mingledorffs.com",
  "re_michel_hsv": "remichel.com",
  "ready_mix_usa_hsv": "readymixusa.com",
  "shearer_supply_hsv": "shearersupply.com",
  "srm_concrete_hsv": "srmconcrete.com",
  "srs_hsv": "srsdistribution.com",
  "trane_supply_hsv": "trane.com",
  "us_brick_madison": "usbrick.com",
  "vulcan_materials_hsv": "vulcanmaterials.com",
  "wittichen_hsv": "wittichen-supply.com",

  // Prod verified domains not yet in local
  "city_electric_hsv": "cityelectricsupply.com",
  "daltile_hsv": "daltile.com",
  "fastenal_hsv": "fastenal.com",
  "floor_decor_hsv": "flooranddecor.com",
  "floor_decor_madison": "flooranddecor.com",
  "graybar_hsv": "graybar.com",
  "metal_supermarkets_hsv": "metalsupermarkets.com",
  "siteone_hsv": "siteone.com",
  "siteone_north_hsv": "siteone.com",
  "sunbelt_hsv": "sunbeltrentals.com",
  "sw_auto_finishes": "sherwin-williams.com",
  "sw_commercial_meridian": "sherwin-williams.com",
  "sw_madison_commercial": "sherwin-williams.com",
  "sw_memorial_nw": "sherwin-williams.com",
  "sw_memorial_sw": "sherwin-williams.com",
  "sw_monroe": "sherwin-williams.com",
  "sw_owens_cross": "sherwin-williams.com",
  "sw_product_finishes": "sherwin-williams.com",
  "united_rentals_hsv": "unitedrentals.com",
};

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

async function main() {
  const prisma = getPrisma();

  let updated = 0;
  let alreadyCorrect = 0;
  let missingSupplier = 0;
  let conflicts = 0;

  for (const [id, rawDomain] of Object.entries(SUPPLIER_DOMAINS)) {
    const domain = normalizeDomain(rawDomain);

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      select: { id: true, name: true, domain: true },
    });

    if (!supplier) {
      missingSupplier++;
      console.log(`MISSING SUPPLIER\t${id}\t${domain}`);
      continue;
    }

    const existing = supplier.domain ? normalizeDomain(supplier.domain) : "";

    if (existing === domain) {
      alreadyCorrect++;
      console.log(`OK\t${id}\t${supplier.name}\t${domain}`);
      continue;
    }

    if (existing && existing !== domain) {
      conflicts++;
      console.log(`CONFLICT\t${id}\t${supplier.name}\texisting=${existing}\tnew=${domain}`);
      continue;
    }

    await prisma.supplier.update({
      where: { id },
      data: { domain },
    });

    updated++;
    console.log(`UPDATED\t${id}\t${supplier.name}\t${domain}`);
  }

  console.log("\nSUMMARY");
  console.log({ updated, alreadyCorrect, missingSupplier, conflicts });

  await prisma.$disconnect();

  if (conflicts > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
