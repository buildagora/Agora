import { searchConstructorCatalog } from "../searchConstructorCatalog";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const originalFetch = global.fetch;

console.log("\nsearchConstructorCatalog tests\n");

async function run() {
  let capturedUrl = "";
  global.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify({
        response: {
          results: [
            {
              data: {
                prdName: "Test Shingle",
                url: "/productDetail/C-1?skuId=1",
                image_url: "/images/large/test.jpg",
                facets: [{ name: "prdBrand", values: ["GAF"] }],
              },
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const rows = await searchConstructorCatalog({
    query: "shingles",
    supplierIds: ["cmn90dbjr000404ldzhcsquav", "other_qxo_branch"],
    source: "QXO",
    logLabel: "QXO",
    constructor: {
      apiKey: "test-key",
      baseUrl: "https://ac.cnstrc.com",
      numResultsPerPage: 6,
      imageCdnBase: "https://static-ng.becn.digital",
      siteOrigin: "https://www.qxo.com",
    },
  });

  assert(
    capturedUrl.includes("/v1/search/shingles?"),
    "calls Constructor search endpoint with encoded query"
  );
  assert(capturedUrl.includes("key=test-key"), "passes api key");
  assert(capturedUrl.includes("num_results_per_page=6"), "passes num_results_per_page");
  assert(rows.length === 2, "fans out one API result to each supplierId");
  assert(rows.every((r) => r.classification === "PRODUCT_PAGE"), "all rows are PRODUCT_PAGE");

  global.fetch = originalFetch;

  global.fetch = (async () => new Response("error", { status: 500 })) as typeof fetch;
  const empty = await searchConstructorCatalog({
    query: "shingles",
    supplierIds: ["cmn90dbjr000404ldzhcsquav"],
    source: "QXO",
    logLabel: "QXO",
    constructor: {
      apiKey: "test-key",
      baseUrl: "https://ac.cnstrc.com",
      numResultsPerPage: 6,
      imageCdnBase: "https://static-ng.becn.digital",
      siteOrigin: "https://www.qxo.com",
    },
  });
  assert(empty.length === 0, "returns empty array on HTTP error");
  global.fetch = originalFetch;

  console.log("\nAll searchConstructorCatalog tests passed.\n");
}

run().catch((err) => {
  global.fetch = originalFetch;
  console.error(err);
  process.exit(1);
});
