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
import type { ExtractedProductMetadata } from "./extractProductMetadata";

export const PAGE_METADATA_CACHE_SCHEMA_VERSION = "v1";

export const DEFAULT_PAGE_METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = join(process.cwd(), "scripts", "cache", "schema-page-metadata");

export type PageMetadataCacheEntry = ExtractedProductMetadata & {
  schemaVersion: string;
  url: string;
  cachedAt: string;
};

export type PageMetadataCacheDeps = {
  cacheTtlMs?: number;
  useDiskCache?: boolean;
};

let memoryCache = new Map<
  string,
  { entry: PageMetadataCacheEntry; expiresAt: number }
>();

export function resetPageMetadataCacheForTests() {
  memoryCache = new Map();
}

export function normalizePageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.host = parsed.host.toLowerCase();
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

export function pageMetadataCacheKey(url: string): string {
  const material = `${PAGE_METADATA_CACHE_SCHEMA_VERSION}:${normalizePageUrl(url)}`;
  return createHash("sha1").update(material).digest("hex");
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

function isValidEntry(raw: unknown, url: string): raw is PageMetadataCacheEntry {
  if (!raw || typeof raw !== "object") return false;
  const entry = raw as PageMetadataCacheEntry;
  if (entry.schemaVersion !== PAGE_METADATA_CACHE_SCHEMA_VERSION) return false;
  if (normalizePageUrl(entry.url) !== normalizePageUrl(url)) return false;
  if (typeof entry.title !== "string" || !entry.title.trim()) return false;
  if (typeof entry.productUrl !== "string" || !entry.productUrl.trim()) return false;
  return true;
}

function readDiskCache(key: string, ttlMs: number): PageMetadataCacheEntry | null {
  try {
    const path = cachePath(key);
    if (!existsSync(path)) return null;
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > ttlMs) {
      unlinkSync(path);
      return null;
    }
    return JSON.parse(readFileSync(path, "utf8")) as PageMetadataCacheEntry;
  } catch {
    return null;
  }
}

function writeDiskCache(key: string, entry: PageMetadataCacheEntry) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(key), JSON.stringify(entry), "utf8");
  } catch {
    /* cache is best-effort */
  }
}

export function loadPageMetadataCache(
  url: string,
  deps?: PageMetadataCacheDeps
): ExtractedProductMetadata | null {
  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_PAGE_METADATA_CACHE_TTL_MS;
  const useDiskCache = deps?.useDiskCache ?? true;
  const key = pageMetadataCacheKey(url);

  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now() && isValidEntry(mem.entry, url)) {
    const { schemaVersion: _v, url: _u, cachedAt: _c, ...metadata } = mem.entry;
    return metadata;
  }

  if (useDiskCache) {
    const disk = readDiskCache(key, cacheTtlMs);
    if (disk && isValidEntry(disk, url)) {
      memoryCache.set(key, {
        entry: disk,
        expiresAt: Date.now() + cacheTtlMs,
      });
      const { schemaVersion: _v, url: _u, cachedAt: _c, ...metadata } = disk;
      return metadata;
    }
  }

  return null;
}

export function writePageMetadataCache(
  url: string,
  metadata: ExtractedProductMetadata,
  deps?: PageMetadataCacheDeps
): void {
  if (!metadata.title.trim() || !metadata.productUrl.trim()) return;

  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_PAGE_METADATA_CACHE_TTL_MS;
  const useDiskCache = deps?.useDiskCache ?? true;
  const key = pageMetadataCacheKey(url);
  const entry: PageMetadataCacheEntry = {
    schemaVersion: PAGE_METADATA_CACHE_SCHEMA_VERSION,
    url: normalizePageUrl(url),
    title: metadata.title,
    productUrl: metadata.productUrl,
    imageUrl: metadata.imageUrl ?? null,
    brand: metadata.brand ?? null,
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
