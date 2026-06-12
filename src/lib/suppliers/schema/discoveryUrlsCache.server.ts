import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { normalizeStoredSitemapUrls } from "./sitemapParse";

export const DISCOVERY_URLS_CACHE_SCHEMA_VERSION = "v1";

export const DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = join(
  process.cwd(),
  "scripts",
  "cache",
  "schema-discovery-urls"
);

export type DiscoveryUrlsCacheEntry = {
  schemaVersion: string;
  supplierId: string;
  sourceSitemapUrls: string[];
  parseLimit: number;
  discoveryUrls: string[];
  cachedAt: string;
};

export type DiscoveryUrlsCacheInput = {
  supplierId: string;
  sitemapUrls: string[];
  parseLimit: number;
};

export type DiscoveryUrlsCacheDeps = {
  cacheTtlMs?: number;
  useDiskCache?: boolean;
};

let memoryCache = new Map<
  string,
  { entry: DiscoveryUrlsCacheEntry; expiresAt: number }
>();

export function resetDiscoveryUrlsCacheForTests() {
  memoryCache = new Map();
}

export function discoveryUrlsCacheKey(input: DiscoveryUrlsCacheInput): string {
  const normalizedUrls = normalizeStoredSitemapUrls(input.sitemapUrls).sort();
  const material = [
    DISCOVERY_URLS_CACHE_SCHEMA_VERSION,
    input.supplierId,
    String(input.parseLimit),
    normalizedUrls.join("|"),
  ].join(":");
  return createHash("sha1").update(material).digest("hex");
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

function isValidEntry(
  raw: unknown,
  input: DiscoveryUrlsCacheInput
): raw is DiscoveryUrlsCacheEntry {
  if (!raw || typeof raw !== "object") return false;
  const entry = raw as DiscoveryUrlsCacheEntry;
  if (entry.schemaVersion !== DISCOVERY_URLS_CACHE_SCHEMA_VERSION) return false;
  if (entry.supplierId !== input.supplierId) return false;
  if (entry.parseLimit !== input.parseLimit) return false;
  if (!Array.isArray(entry.discoveryUrls)) return false;
  if (!Array.isArray(entry.sourceSitemapUrls)) return false;
  const expected = normalizeStoredSitemapUrls(input.sitemapUrls).sort();
  const actual = [...entry.sourceSitemapUrls].sort();
  if (expected.length !== actual.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== actual[i]) return false;
  }
  return entry.discoveryUrls.every(
    (url) => typeof url === "string" && url.trim().length > 0
  );
}

function readDiskCache(
  key: string,
  ttlMs: number
): DiscoveryUrlsCacheEntry | null {
  try {
    const path = cachePath(key);
    if (!existsSync(path)) return null;
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > ttlMs) {
      unlinkSync(path);
      return null;
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed as DiscoveryUrlsCacheEntry;
  } catch {
    return null;
  }
}

function writeDiskCache(key: string, entry: DiscoveryUrlsCacheEntry) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(key), JSON.stringify(entry), "utf8");
  } catch {
    /* cache is best-effort */
  }
}

export function loadDiscoveryUrlsCache(
  input: DiscoveryUrlsCacheInput,
  deps?: DiscoveryUrlsCacheDeps
): DiscoveryUrlsCacheEntry | null {
  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS;
  const useDiskCache = deps?.useDiskCache ?? true;
  const key = discoveryUrlsCacheKey(input);

  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now() && isValidEntry(mem.entry, input)) {
    return mem.entry;
  }

  if (useDiskCache) {
    const disk = readDiskCache(key, cacheTtlMs);
    if (disk && isValidEntry(disk, input)) {
      memoryCache.set(key, {
        entry: disk,
        expiresAt: Date.now() + cacheTtlMs,
      });
      return disk;
    }
  }

  return null;
}

export function writeDiscoveryUrlsCache(
  input: DiscoveryUrlsCacheInput,
  discoveryUrls: string[],
  deps?: DiscoveryUrlsCacheDeps
): void {
  if (discoveryUrls.length === 0) return;

  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_DISCOVERY_URLS_CACHE_TTL_MS;
  const useDiskCache = deps?.useDiskCache ?? true;
  const key = discoveryUrlsCacheKey(input);
  const entry: DiscoveryUrlsCacheEntry = {
    schemaVersion: DISCOVERY_URLS_CACHE_SCHEMA_VERSION,
    supplierId: input.supplierId,
    sourceSitemapUrls: normalizeStoredSitemapUrls(input.sitemapUrls),
    parseLimit: input.parseLimit,
    discoveryUrls: [...new Set(discoveryUrls)],
    cachedAt: new Date().toISOString(),
  };

  memoryCache.set(key, {
    entry,
    expiresAt: Date.now() + cacheTtlMs,
  });

  if (useDiskCache) {
    writeDiskCache(key, entry);
  }
}
