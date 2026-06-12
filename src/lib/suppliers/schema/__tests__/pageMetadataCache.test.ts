import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PAGE_METADATA_CACHE_TTL_MS,
  loadPageMetadataCache,
  normalizePageUrl,
  pageMetadataCacheKey,
  resetPageMetadataCacheForTests,
  writePageMetadataCache,
} from "../pageMetadataCache.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const CACHE_DIR = join(process.cwd(), "scripts", "cache", "schema-page-metadata");

const pageUrl = "https://www.example.com/product/shingle-123";
const metadata = {
  title: "GAF Timberline HDZ Shingle",
  productUrl: pageUrl,
  imageUrl: "https://www.example.com/images/timberline.jpg",
  brand: "GAF",
};

console.log("\npageMetadataCache tests\n");

resetPageMetadataCacheForTests();

assert(
  loadPageMetadataCache(pageUrl, { useDiskCache: false }) === null,
  "cache miss on empty store"
);

writePageMetadataCache(pageUrl, metadata, { useDiskCache: false });
const hit = loadPageMetadataCache(pageUrl, { useDiskCache: false });
assert(hit !== null, "cache hit after write");
assert(hit?.title === metadata.title, "cache hit returns title");
assert(hit?.productUrl === metadata.productUrl, "cache hit returns productUrl");

resetPageMetadataCacheForTests();
writePageMetadataCache(pageUrl, metadata, {
  useDiskCache: false,
  cacheTtlMs: -1,
});
assert(
  loadPageMetadataCache(pageUrl, { useDiskCache: false }) === null,
  "expired memory entry treated as miss"
);

resetPageMetadataCacheForTests();
const key = pageMetadataCacheKey(pageUrl);
mkdirSync(CACHE_DIR, { recursive: true });
writeFileSync(
  join(CACHE_DIR, `${key}.json`),
  JSON.stringify({ invalid: true }),
  "utf8"
);
assert(
  loadPageMetadataCache(pageUrl, { useDiskCache: true }) === null,
  "malformed disk entry treated as miss"
);

resetPageMetadataCacheForTests();
writePageMetadataCache(pageUrl, metadata, { useDiskCache: false });
assert(
  loadPageMetadataCache(`${pageUrl}/`, { useDiskCache: false }) !== null,
  "URL normalization treats trailing slash as same key"
);

resetPageMetadataCacheForTests();
writePageMetadataCache(pageUrl, metadata, {
  useDiskCache: true,
  cacheTtlMs: DEFAULT_PAGE_METADATA_CACHE_TTL_MS,
});
const diskKey = pageMetadataCacheKey(pageUrl);
const diskPath = join(CACHE_DIR, `${diskKey}.json`);
const diskHit = loadPageMetadataCache(pageUrl, { useDiskCache: true });
assert(diskHit !== null, "disk cache hit after write");
assert(
  normalizePageUrl(pageUrl) === normalizePageUrl(`${pageUrl}/`),
  "normalizePageUrl strips trailing slash"
);

if (existsSync(diskPath)) {
  const stale = Date.now() - DEFAULT_PAGE_METADATA_CACHE_TTL_MS - 60_000;
  utimesSync(diskPath, stale / 1000, stale / 1000);
}
resetPageMetadataCacheForTests();
assert(
  loadPageMetadataCache(pageUrl, {
    useDiskCache: true,
    cacheTtlMs: DEFAULT_PAGE_METADATA_CACHE_TTL_MS,
  }) === null,
  "expired disk entry treated as miss"
);
assert(!existsSync(diskPath), "expired disk entry is removed");

try {
  rmSync(diskPath, { force: true });
} catch {
  /* cleanup best-effort */
}

console.log("\nAll pageMetadataCache tests passed.\n");
