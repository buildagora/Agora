/**
 * Disk cache for SerpAPI responses.
 *
 * Why: SerpAPI calls are slow and cost money. Once we've crawled a
 * (query, supplier, engine) tuple, we should never pay for it again unless
 * the data is genuinely stale.
 *
 * How: content-addressed file cache under `scripts/cache/serpapi/`. The
 * cache key is a SHA-1 of the normalized URL (api_key redacted, params
 * sorted) so the same SerpAPI request always hits the same cache file
 * regardless of param order or which API key issued it.
 *
 * Drop-in replacement for `fetch(url)`: returns a Response object so
 * existing call sites can keep using `await res.json()`.
 *
 * Safe in prod (Vercel): if the cache dir can't be created or written,
 * silently falls through to a direct fetch — never throws on cache errors.
 */

import "server-only";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "scripts", "cache", "serpapi");
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cacheDirReady: boolean | null = null;
function ensureCacheDir(): boolean {
  if (cacheDirReady !== null) return cacheDirReady;
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    cacheDirReady = true;
  } catch {
    cacheDirReady = false;
  }
  return cacheDirReady;
}

/**
 * Build a stable cache key from a SerpAPI URL.
 * Strips api_key so rotating the key doesn't invalidate the cache,
 * and sorts params so URL ordering doesn't matter.
 */
export function serpCacheKey(url: string): string {
  let normalized: string;
  try {
    const u = new URL(url);
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => k.toLowerCase() !== "api_key")
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.map(([k, v]) => `${k}=${v}`).join("&");
    normalized = `${u.origin}${u.pathname}?${qs}`;
  } catch {
    normalized = url;
  }
  return createHash("sha1").update(normalized).digest("hex");
}

type CacheStats = { hits: number; misses: number; writes: number };
const stats: CacheStats = { hits: 0, misses: 0, writes: 0 };

/** Returns cumulative hit/miss/write counters since process start. Useful in scripts. */
export function getSerpCacheStats(): CacheStats {
  return { ...stats };
}

/**
 * Drop-in replacement for `fetch(serpapiUrl, init?)`. Reads from disk cache
 * on hit; on miss, fetches and writes through.
 *
 * The cache stores the body text + the original status. Headers are not
 * persisted (SerpAPI responses are always JSON; callers .json()).
 */
export async function cachedSerpFetch(
  url: string,
  init?: RequestInit,
  opts?: { ttlMs?: number; bypassCache?: boolean }
): Promise<Response> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const bypass = !!opts?.bypassCache;

  if (!bypass && ensureCacheDir()) {
    const path = join(CACHE_DIR, `${serpCacheKey(url)}.json`);
    if (existsSync(path)) {
      try {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age < ttlMs) {
          const body = readFileSync(path, "utf8");
          stats.hits++;
          return new Response(body, {
            status: 200,
            headers: { "content-type": "application/json", "x-agora-serp-cache": "hit" },
          });
        }
      } catch {
        /* fall through to network */
      }
    }
  }

  stats.misses++;
  const res = await fetch(url, init);
  if (!res.ok) return res;

  const text = await res.text();
  if (!bypass && ensureCacheDir()) {
    try {
      const path = join(CACHE_DIR, `${serpCacheKey(url)}.json`);
      writeFileSync(path, text, "utf8");
      stats.writes++;
    } catch {
      /* cache write failure shouldn't break the request */
    }
  }
  return new Response(text, {
    status: res.status,
    headers: { "content-type": "application/json", "x-agora-serp-cache": "miss" },
  });
}
