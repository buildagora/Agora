import { searchSupplierSite } from "../src/lib/suppliers/searchSupplierSite";

const tests = [
  { supplierId: "grainger_hsv", name: "Grainger", domain: "grainger.com", query: "ladder" },
  { supplierId: "city_electric_hsv", name: "City Electric Supply", domain: "cityelectricsupply.com", query: "breaker" },
  { supplierId: "daltile_hsv", name: "Daltile", domain: "daltile.com", query: "subway tile" },
  { supplierId: "floor_decor_hsv", name: "Floor & Decor", domain: "flooranddecor.com", query: "vinyl plank" },
  { supplierId: "graybar_hsv", name: "Graybar", domain: "graybar.com", query: "conduit" },
  { supplierId: "siteone_hsv", name: "SiteOne", domain: "siteone.com", query: "mulch" },
  { supplierId: "sunbelt_hsv", name: "Sunbelt Rentals", domain: "sunbeltrentals.com", query: "scissor lift" },
];

async function main() {
for (const t of tests) {
  console.log(`\n============================================================`);
  console.log(`${t.name} | ${t.domain} | query="${t.query}"`);
  console.log(`============================================================`);

  const results = await searchSupplierSite({
    query: t.query,
    domain: t.domain,
    supplierIds: [t.supplierId],
    source: "GENERIC",
    logLabel: t.name,
  });

  console.log("count:", results.length);

  for (const [i, r] of results.slice(0, 8).entries()) {
    console.log(`\n${i + 1}. ${r.title}`);
    console.log(`   image: ${r.imageUrl ? "YES" : "NO"}`);
    console.log(`   url: ${r.productUrl}`);
  }
}

}

main().catch((err) => { console.error(err); process.exit(1); });
