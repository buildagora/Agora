import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { decompressSitemapBody, isGzipSitemapUrl } from "./decompressSitemapBody";

export const SCHEMA_SITEMAP_EXEC_USER_AGENT =
  "Agora/1.0 (+supplier-discovery; schema-sitemap-exec)";

export const DEFAULT_SCHEMA_SITEMAP_TIMEOUT_MS = 15_000;
export const DEFAULT_SCHEMA_SITEMAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = join(process.cwd(), "scripts", "cache", "schema-sitemap-exec");

export type SchemaSitemapFetchResult = {
  url: string;
  status: number | null;
  html: string;
  error?: string;
  decompressLatencyMs?: number;
  fromCache?: boolean;
  bytesFetched?: number;
  fetchLatencyMs?: number;
};

export type SchemaSitemapFetchDeps = {
  fetchFn?: (
    url: string,
    init: RequestInit
  ) => Promise<{
    status: number;
    text?: () => Promise<string>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    headers?: { get(name: string): string | null };
  }>;
  timeoutMs?: number;
  cacheTtlMs?: number;
  useDiskCache?: boolean;
};

let memoryCache = new Map<
  string,
  { body: string; status: number; expiresAt: number }
>();

export function resetSchemaSitemapFetchCacheForTests() {
  memoryCache = new Map();
}

function cacheKey(url: string): string {
  return createHash("sha1").update(`v2:${url}`).digest("hex");
}

function readDiskCache(
  key: string,
  ttlMs: number
): { body: string; status: number } | null {
  try {
    const path = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(path)) return null;
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      body: string;
      status: number;
    };
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(key: string, body: string, status: number) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      join(CACHE_DIR, `${key}.json`),
      JSON.stringify({ body, status }),
      "utf8"
    );
  } catch {
    /* cache is best-effort */
  }
}

export async function fetchSchemaSitemapUrl(
  url: string,
  deps?: SchemaSitemapFetchDeps
): Promise<SchemaSitemapFetchResult> {
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_SCHEMA_SITEMAP_TIMEOUT_MS;
  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_SCHEMA_SITEMAP_CACHE_TTL_MS;
  const useDiskCache = deps?.useDiskCache ?? true;
  const key = cacheKey(url);

  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return {
      url,
      status: mem.status,
      html: mem.body,
      fromCache: true,
      decompressLatencyMs: 0,
      bytesFetched: 0,
      fetchLatencyMs: 0,
    };
  }

  if (useDiskCache) {
    const disk = readDiskCache(key, cacheTtlMs);
    if (disk) {
      memoryCache.set(key, {
        body: disk.body,
        status: disk.status,
        expiresAt: Date.now() + cacheTtlMs,
      });
      return {
        url,
        status: disk.status,
        html: disk.body,
        fromCache: true,
        decompressLatencyMs: 0,
        bytesFetched: 0,
        fetchLatencyMs: 0,
      };
    }
  }

  const fetchFn =
    deps?.fetchFn ??
    (async (target, init) => {
      const res = await fetch(target, init);
      return {
        status: res.status,
        arrayBuffer: () => res.arrayBuffer(),
        headers: res.headers,
      };
    });

  try {
    const fetchStart = Date.now();
    const res = await fetchFn(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml,text/xml,*/*",
        "User-Agent": SCHEMA_SITEMAP_EXEC_USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const fetchLatencyMs = Date.now() - fetchStart;
    let raw: Buffer;
    if ("arrayBuffer" in res && res.arrayBuffer) {
      raw = Buffer.from(await res.arrayBuffer());
    } else if ("text" in res && res.text) {
      raw = Buffer.from(await res.text(), "utf8");
    } else {
      raw = Buffer.alloc(0);
    }
    const contentEncoding = res.headers?.get("content-encoding");
    const shouldDecompress =
      isGzipSitemapUrl(url) ||
      contentEncoding?.toLowerCase().includes("gzip") ||
      (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b);
    let decompressLatencyMs = 0;
    let html: string;
    if (shouldDecompress && raw.length > 0) {
      const decompressStart = Date.now();
      html = decompressSitemapBody(raw, url, contentEncoding);
      decompressLatencyMs = Date.now() - decompressStart;
    } else {
      html = raw.toString("utf8");
    }
    memoryCache.set(key, {
      body: html,
      status: res.status,
      expiresAt: Date.now() + cacheTtlMs,
    });
    if (useDiskCache) {
      writeDiskCache(key, html, res.status);
    }
    return {
      url,
      status: res.status,
      html,
      decompressLatencyMs,
      fromCache: false,
      bytesFetched: Buffer.byteLength(html, "utf8"),
      fetchLatencyMs,
    };
  } catch (err) {
    return {
      url,
      status: null,
      html: "",
      error: err instanceof Error ? err.message : String(err),
      bytesFetched: 0,
      fetchLatencyMs: 0,
    };
  }
}

export class SchemaSitemapRequestBudget {
  readonly max: number;
  used = 0;

  constructor(max: number) {
    this.max = max;
  }

  canFetch(): boolean {
    return this.used < this.max;
  }

  consume(): boolean {
    if (!this.canFetch()) return false;
    this.used += 1;
    return true;
  }
}

export async function fetchSchemaSitemapUrlsParallel(
  urls: string[],
  deps: SchemaSitemapFetchDeps | undefined,
  concurrency: number
): Promise<SchemaSitemapFetchResult[]> {
  const results: SchemaSitemapFetchResult[] = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const current = urls[index];
      index += 1;
      results.push(await fetchSchemaSitemapUrl(current, deps));
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
