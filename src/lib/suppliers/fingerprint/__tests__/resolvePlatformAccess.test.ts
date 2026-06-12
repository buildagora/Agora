import { resolvePlatformAccess } from "../resolvePlatformAccess";
import type { EnvKeyPresence } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const emptyEnv: EnvKeyPresence = {};

console.log("\nresolvePlatformAccess tests\n");

assert(
  resolvePlatformAccess({ platform: "SHOPIFY", envKeyPresence: emptyEnv })
    .platformAccessStatus === "PUBLIC_ANONYMOUS",
  "Shopify → PUBLIC_ANONYMOUS"
);

assert(
  resolvePlatformAccess({
    platform: "ALGOLIA",
    algoliaConfig: {
      appId: "x",
      indexName: "products",
      siteOrigin: "https://example.com",
      searchApiKey: "public-key",
    },
    envKeyPresence: emptyEnv,
  }).platformAccessStatus === "PUBLIC_ANONYMOUS",
  "Algolia with storefront searchApiKey → PUBLIC_ANONYMOUS"
);

assert(
  resolvePlatformAccess({
    platform: "CONSTRUCTOR",
    constructorConfig: { apiKeyEnv: "CONSTRUCTOR_API_KEY_QXO", imageCdnBase: "", siteOrigin: "" },
    envKeyPresence: { CONSTRUCTOR_API_KEY_QXO: true },
  }).platformAccessStatus === "ACCESSIBLE",
  "Constructor with required env → ACCESSIBLE"
);

assert(
  resolvePlatformAccess({
    platform: "CONSTRUCTOR",
    constructorConfig: { apiKeyEnv: "CONSTRUCTOR_API_KEY_QXO", imageCdnBase: "", siteOrigin: "" },
    envKeyPresence: {},
  }).platformAccessStatus === "BINDING_INCOMPLETE",
  "Constructor without env → BINDING_INCOMPLETE"
);

assert(
  resolvePlatformAccess({
    platform: "BLOOMREACH",
    bloomreachConfig: {
      accountId: "1",
      domainKey: "baker",
      baseImageUrl: "https://cdn.example.com/",
      siteOrigin: "https://example.com",
      authKeyEnv: "BLOOMREACH_AUTH_KEY_BAKER",
    },
    envKeyPresence: {},
  }).platformAccessStatus === "BINDING_INCOMPLETE",
  "Bloomreach without auth env → BINDING_INCOMPLETE"
);

assert(
  resolvePlatformAccess({
    platform: "BLOOMREACH",
    bloomreachConfig: {
      accountId: "1",
      domainKey: "baker",
      baseImageUrl: "https://cdn.example.com/",
      siteOrigin: "https://example.com",
      authKeyEnv: "BLOOMREACH_AUTH_KEY_BAKER",
    },
    envKeyPresence: { BLOOMREACH_AUTH_KEY_BAKER: true },
  }).platformAccessStatus === "ACCESSIBLE",
  "Bloomreach with auth env → ACCESSIBLE"
);

assert(
  resolvePlatformAccess({ platform: "SLI", envKeyPresence: emptyEnv }).platformAccessStatus ===
    "ACCESSIBLE",
  "SLI → ACCESSIBLE"
);

assert(
  resolvePlatformAccess({
    platform: "HYBRIS",
    legacyMode: "hybris",
    hybrisConfig: { siteOrigin: "https://www.siteone.com", variant: "siteone" },
    envKeyPresence: emptyEnv,
  }).platformAccessStatus === "ACCESSIBLE",
  "Hybris with legacy hybris config → ACCESSIBLE"
);

assert(
  resolvePlatformAccess({ platform: "UNKNOWN", envKeyPresence: emptyEnv })
    .platformAccessStatus === "NOT_APPLICABLE",
  "Unknown platform → NOT_APPLICABLE"
);

console.log("\nAll resolvePlatformAccess tests passed.\n");
