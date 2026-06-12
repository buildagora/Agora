import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS,
  DISCOVERY_URLS_CACHE_SCHEMA_VERSION,
  discoveryUrlsCacheKey,
  loadDiscoveryUrlsCache,
  resetDiscoveryUrlsCacheForTests,
  writeDiscoveryUrlsCache,
} from "../discoveryUrlsCache.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const CACHE_DIR = join(
  process.cwd(),
  "scripts",
  "cache",
  "schema-discovery-urls"
);

const baseInput = {
  supplierId: "abc_supply_hsv",
  sitemapUrls: [
    "https://www.example.com/sitemap_index.xml",
    "https://www.example.com/sitemap_products_1.xml",
  ],
  parseLimit: 500,
};

const discoveryUrls = [
  "https://www.example.com/product/shingle-123",
  "https://www.example.com/product/shingle-456",
];

console.log("\ndiscoveryUrlsCache tests\n");

resetDiscoveryUrlsCacheForTests();

assert(
  loadDiscoveryUrlsCache(baseInput, { useDiskCache: false }) === null,
  "cache miss on empty store"
);

writeDiscoveryUrlsCache(baseInput, discoveryUrls, { useDiskCache: false });
const hit = loadDiscoveryUrlsCache(baseInput, { useDiskCache: false });
assert(hit !== null, "cache hit after write");
assert(
  hit?.discoveryUrls.length === 2,
  "cache hit returns discovery URL count"
);
assert(
  hit?.discoveryUrls[0] === discoveryUrls[0],
  "cache hit returns first discovery URL"
);

resetDiscoveryUrlsCacheForTests();
writeDiscoveryUrlsCache(baseInput, discoveryUrls, {
  useDiskCache: false,
  cacheTtlMs: -1,
});
const expired = loadDiscoveryUrlsCache(baseInput, {
  useDiskCache: false,
});
assert(expired === null, "expired memory entry treated as miss");

resetDiscoveryUrlsCacheForTests();
const key = discoveryUrlsCacheKey(baseInput);
mkdirSync(CACHE_DIR, { recursive: true });
writeFileSync(
  join(CACHE_DIR, `${key}.json`),
  JSON.stringify({ not: "a valid entry" }),
  "utf8"
);
const malformed = loadDiscoveryUrlsCache(baseInput, { useDiskCache: true });
assert(malformed === null, "malformed disk entry treated as miss");

resetDiscoveryUrlsCacheForTests();
writeDiscoveryUrlsCache(baseInput, discoveryUrls, { useDiskCache: false });
const changedUrls = loadDiscoveryUrlsCache(
  {
    ...baseInput,
    sitemapUrls: ["https://www.example.com/sitemap_products_2.xml"],
  },
  { useDiskCache: false }
);
assert(changedUrls === null, "sitemapUrls change invalidates cache key");

resetDiscoveryUrlsCacheForTests();
writeDiscoveryUrlsCache(baseInput, discoveryUrls, {
  useDiskCache: true,
  cacheTtlMs: DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS,
});
const diskKey = discoveryUrlsCacheKey(baseInput);
const diskPath = join(CACHE_DIR, `${diskKey}.json`);
const diskHit = loadDiscoveryUrlsCache(baseInput, { useDiskCache: true });
assert(diskHit !== null, "disk cache hit after write");
assert(
  diskHit?.schemaVersion === DISCOVERY_URLS_CACHE_SCHEMA_VERSION,
  "disk cache entry has schema version"
);

if (existsSync(diskPath)) {
  const stale = Date.now() - DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS - 60_000;
  utimesSync(diskPath, stale / 1000, stale / 1000);
}
resetDiscoveryUrlsCacheForTests();
const diskExpired = loadDiscoveryUrlsCache(baseInput, {
  useDiskCache: true,
  cacheTtlMs: DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS,
});
assert(diskExpired === null, "expired disk entry treated as miss");
assert(!existsSync(diskPath), "expired disk entry is removed");

try {
  rmSync(diskPath, { force: true });
} catch {
  /* cleanup best-effort */
}

console.log("\nAll discoveryUrlsCache tests passed.\n");
