import fs from "fs";
import * as cheerio from "cheerio";

const supplierId = process.argv[2] || "abc_supply_hsv";
const supplierName = process.argv[3] || "ABC Supply";
const START_URL = process.argv[4] || "https://www.abcsupply.com";

const roofingBrands = [
  { label: "GAF", aliases: ["gaf", "timberline"] },
  { label: "CertainTeed", aliases: ["certainteed", "landmark"] },
  { label: "Owens Corning", aliases: ["owens corning", "duration shingles", "oakridge"] },
  { label: "TAMKO", aliases: ["tamko", "heritage shingles"] },
  { label: "IKO", aliases: ["iko", "cambridge shingles", "dynasty shingles"] },
  { label: "Atlas", aliases: ["atlas", "pinnacle pristine", "stormmaster"] },
  { label: "Malarkey", aliases: ["malarkey", "vista shingles", "legacy shingles"] },
  { label: "Drexel Metals", aliases: ["drexel metals", "drexel"] },
  { label: "McElroy Metal", aliases: ["mcelroy metal", "mc elroy metal"] },
];

const validBrands = new Set(roofingBrands.map((b) => b.label.toLowerCase()));

/** Visible-text subcategory hints (single-page sites); order = priority for first match. */
const roofingSubcategories = [
  {
    label: "Asphalt Shingles",
    aliases: [
      "asphalt shingles",
      "asphalt shingle",
      "composite shingles",
      "architectural shingles",
      "3-tab shingles",
    ],
  },
  {
    label: "Metal Roofing",
    aliases: [
      "metal roofing",
      "standing seam",
      "metal panels",
      "structured metal panels",
    ],
  },
  {
    label: "Wood Roofing",
    aliases: ["cedar shakes", "cedar shingles", "wood shakes", "wood shingles"],
  },
  { label: "Slate Roofing", aliases: ["slate roofing", "slate roof", "slate tiles"] },
  {
    label: "Tile Roofing",
    aliases: ["clay tile", "concrete tile", "roof tiles", "tile roofing"],
  },
  {
    label: "Roofing Insulation",
    aliases: ["roofing insulation", "polyiso", "iso board", "roof insulation"],
  },
  {
    label: "Low Slope Roofing",
    aliases: [
      "low slope",
      "low-slope",
      "single ply",
      "single-ply",
      "modified bitumen",
      "built-up roofing",
      "tpo roofing",
      "epdm",
    ],
  },
  {
    label: "Roofing Accessories",
    aliases: [
      "roofing accessories",
      "underlayment",
      "ice & water",
      "ice and water",
      "roofing fasteners",
      "roof vents",
    ],
  },
];

const MAX_PAGES = 8;
const DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(base, href) {
  try {
    const url = new URL(href, base);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isInternalUrl(startUrl, candidateUrl) {
  return new URL(startUrl).hostname === new URL(candidateUrl).hostname;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "AgoraSupplierResearchBot/0.1 (+public supplier category research)",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.text();
}

function detectMatches(text, items) {
  const lower = text.toLowerCase();
  const matches = [];

  for (const item of items) {
    if (item.aliases.some((alias) => lower.includes(alias.toLowerCase()))) {
      matches.push(item.label);
    }
  }

  return [...new Set(matches)];
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function titleFromPathSlug(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Prefer a specific product h1; skip ABC section headers that repeat across child pages. */
function extractSupplierProductName($, url) {
  const sectionNoise = new Set([
    "steep slope roofing",
    "low slope roofing",
    "products",
    "roofing",
  ]);

  const h1s = $("h1")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);

  for (const h1 of h1s) {
    if (!sectionNoise.has(h1.toLowerCase())) return h1;
  }

  return titleFromPathSlug(url);
}

/**
 * Canonical roofing buckets include: Asphalt Shingles, Metal Roofing, Wood Roofing,
 * Slate Roofing, Tile Roofing, Roofing Insulation, Low Slope Roofing, Roofing Accessories.
 */

function mapProductToCanonicalSubcategory(productName, url) {
  const combined = `${productName} ${url}`.toLowerCase();

  if (
    combined.includes("asphalt-shingles") ||
    combined.includes("asphalt shingles") ||
    combined.includes("composite-shingles") ||
    combined.includes("composite shingles")
  ) {
    return "Asphalt Shingles";
  }

  if (
    combined.includes("metal-roofing") ||
    combined.includes("metal roofing") ||
    combined.includes("structured-metal-panels") ||
    combined.includes("structured metal panels")
  ) {
    return "Metal Roofing";
  }

  if (
    combined.includes("cedar-shakes") ||
    combined.includes("cedar shakes") ||
    combined.includes("wood")
  ) {
    return "Wood Roofing";
  }

  if (combined.includes("slate-roof-tiles") || combined.includes("slate")) {
    return "Slate Roofing";
  }

  if (
    combined.includes("concrete-clay-roof-tiles") ||
    combined.includes("concrete") ||
    combined.includes("clay") ||
    combined.includes("tile")
  ) {
    return "Tile Roofing";
  }

  if (
    combined.includes("roofing-insulation") ||
    combined.includes("roofing insulation") ||
    combined.includes("polyiso") ||
    combined.includes("iso board")
  ) {
    return "Roofing Insulation";
  }

  if (
    combined.includes("single-ply") ||
    combined.includes("single ply") ||
    combined.includes("modified-bitumen") ||
    combined.includes("modified bitumen") ||
    combined.includes("built-up") ||
    combined.includes("built up") ||
    combined.includes("coating systems") ||
    combined.includes("coatings") ||
    combined.includes("low-slope") ||
    combined.includes("low slope")
  ) {
    return "Low Slope Roofing";
  }

  if (
    combined.includes("underlayment") ||
    combined.includes("fasteners") ||
    combined.includes("cements-coatings") ||
    combined.includes("cements") ||
    combined.includes("coatings") ||
    combined.includes("vents") ||
    combined.includes("ice-water-shield") ||
    combined.includes("ice & water") ||
    combined.includes("metal-roofing-accessories") ||
    combined.includes("roofing-accessories") ||
    combined.includes("roofing accessories")
  ) {
    return "Roofing Accessories";
  }

  return null;
}

function isRoofingProductPage(url, text) {
  const combined = `${text} ${url}`.toLowerCase();

  if (!url.includes("/products/")) return false;

  const excludedBroadPages = [
    "/products/",
    "/products/steep-slope-roofing/",
    "/products/low-slope-roofing/",
    "/products/roofing-accessories/",
    "/products/roofing-insulation/",
  ];

  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  if (excludedBroadPages.includes(pathname)) return false;

  const roofingSignals = [
    "roof",
    "roofing",
    "shingles",
    "underlayment",
    "fasteners",
    "vents",
    "ice-water-shield",
    "ice & water",
    "metal roofing",
    "asphalt shingles",
    "cedar shakes",
    "slate roof",
    "roof tiles",
    "coatings",
    "cements",
  ];

  return roofingSignals.some((signal) => combined.includes(signal));
}

async function main() {
  console.log(
    `Crawling supplier site: ${supplierName} (${supplierId}) — ${START_URL}`
  );

  const homepageHtml = await fetchHtml(START_URL);
  const $ = cheerio.load(homepageHtml);

  const links = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = cleanText($(el).text());

    if (!href) return;

    const fullUrl = normalizeUrl(START_URL, href);
    if (!fullUrl) return;

    if (isInternalUrl(START_URL, fullUrl) && isRoofingProductPage(fullUrl, text)) {
      links.add(fullUrl);
    }
  });

  const productLinks = [...links];

  if (productLinks.length === 0) {
    console.log("No product links found — using current page as product source");
    productLinks.push(START_URL);
  }

  const pagesToScan = productLinks.slice(0, MAX_PAGES);

  console.log("\nRoofing product pages selected for scan:");
  if (pagesToScan.length === 0) {
    console.log("- (none — no product links matched from homepage)");
  } else {
    pagesToScan.forEach((url) => console.log(`- ${url}`));
  }

  const results = [];

  for (const url of pagesToScan) {
    await sleep(DELAY_MS);

    console.log(`\nScanning: ${url}`);

    try {
      const html = await fetchHtml(url);
      const page = cheerio.load(html);
      const text = page("body").text();

      const supplierProductName = extractSupplierProductName(page, url);
      const canonicalFromUrl = mapProductToCanonicalSubcategory(
        supplierProductName,
        url
      );

      const subcategoryCandidates = detectMatches(text, roofingSubcategories);

      const primarySubcategory = subcategoryCandidates.length
        ? subcategoryCandidates[0]
        : "Unknown";

      const canonicalSubcategory =
        canonicalFromUrl ??
        (primarySubcategory !== "Unknown" ? primarySubcategory : null);

      const images = page("img");
      const imageBrandCandidates = [];

      images.each((_, el) => {
        const alt = (page(el).attr("alt") || "").toLowerCase();
        const src = (page(el).attr("src") || "").toLowerCase();

        const combined = `${alt} ${src}`;

        for (const brand of roofingBrands) {
          for (const alias of brand.aliases) {
            if (combined.includes(alias.toLowerCase())) {
              imageBrandCandidates.push(brand.label);
            }
          }
        }
      });

      const brands = Array.from(
        new Set([
          ...detectMatches(text, roofingBrands),
          ...imageBrandCandidates,
        ])
      ).filter((b) => validBrands.has(b.toLowerCase()));

      console.log("Product:", supplierProductName);
      console.log("Canonical Subcategory:", canonicalSubcategory || "none");
      console.log("Brands:", brands.length ? brands : "none");

      results.push({
        supplierId,
        supplier: supplierName,
        sourceUrl: url,
        supplierProductName,
        canonicalSubcategory,
        brands,
      });
    } catch (error) {
      console.log(`Failed: ${error.message}`);
    }
  }

  console.log("\nFinal extracted intelligence:");
  console.log(JSON.stringify(results, null, 2));

  const normalizedCapabilities = [];

  for (const record of results) {
    const { sourceUrl, canonicalSubcategory, brands } = record;

    if (!canonicalSubcategory) continue;
    if (!brands || brands.length === 0) continue;

    for (const brand of brands) {
      normalizedCapabilities.push({
        supplierId,
        supplier: supplierName,
        subcategory: canonicalSubcategory,
        brand,
        sourceUrl,
        confidence: "high",
      });
    }
  }

  console.log("\nNormalized Supplier Capabilities:");
  console.log(JSON.stringify(normalizedCapabilities, null, 2));

  if (!fs.existsSync("./scripts/output")) {
    fs.mkdirSync("./scripts/output", { recursive: true });
  }

  const isDefaultAbcCrawl =
    supplierId === "abc_supply_hsv" &&
    supplierName === "ABC Supply" &&
    START_URL === "https://www.abcsupply.com";

  const resultsPath = isDefaultAbcCrawl
    ? "./scripts/output/abc-supply-roofing.json"
    : `./scripts/output/${supplierId}-roofing.json`;
  const capabilitiesPath = isDefaultAbcCrawl
    ? "./scripts/output/abc-supply-capabilities.json"
    : `./scripts/output/${supplierId}-capabilities.json`;

  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  fs.writeFileSync(
    capabilitiesPath,
    JSON.stringify(normalizedCapabilities, null, 2)
  );
}

main().catch((error) => {
  console.error("Crawler failed:", error.message);
  process.exit(1);
});
