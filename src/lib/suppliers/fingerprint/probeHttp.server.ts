import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { decompressSitemapBody, isGzipSitemapUrl } from "../schema/decompressSitemapBody";

export const PROBE_USER_AGENT =
  "Agora/1.0 (+supplier-discovery; fingerprint-probe)";

export const DEFAULT_PROBE_TIMEOUT_MS = 12_000;
export const DEFAULT_PROBE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CACHE_DIR = join(process.cwd(), "scripts", "cache", "fingerprint-probe");

export type ProbeFetchResult = {
  url: string;
  status: number | null;
  html: string;
  error?: string;
};

export type ProbeFetchDeps = {
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

let memoryCache = new Map<string, { body: string; status: number; expiresAt: number }>();

export function resetProbeHttpCacheForTests() {
  memoryCache = new Map();
}

function cacheKey(url: string): string {
  return createHash("sha1").update(url).digest("hex");
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

export async function fetchProbeUrl(
  url: string,
  deps?: ProbeFetchDeps
): Promise<ProbeFetchResult> {
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_PROBE_CACHE_TTL_MS;
  const useDiskCache = deps?.useDiskCache ?? true;
  const key = cacheKey(url);

  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return { url, status: mem.status, html: mem.body };
  }

  if (useDiskCache) {
    const disk = readDiskCache(key, cacheTtlMs);
    if (disk) {
      memoryCache.set(key, {
        body: disk.body,
        status: disk.status,
        expiresAt: Date.now() + cacheTtlMs,
      });
      return { url, status: disk.status, html: disk.body };
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
    const res = await fetchFn(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml,text/xml,*/*",
        "User-Agent": PROBE_USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    let raw: Buffer;
    if ("arrayBuffer" in res && res.arrayBuffer) {
      raw = Buffer.from(await res.arrayBuffer());
    } else if ("text" in res && res.text) {
      raw = Buffer.from(await res.text(), "utf8");
    } else {
      raw = Buffer.alloc(0);
    }
    const isSitemapFetch =
      isGzipSitemapUrl(url) ||
      /\.xml(?:\.gz)?(?:$|[?#])/i.test(url) ||
      url.toLowerCase().includes("sitemap");
    const html = isSitemapFetch
      ? decompressSitemapBody(raw, url, res.headers?.get("content-encoding"))
      : raw.toString("utf8");
    memoryCache.set(key, {
      body: html,
      status: res.status,
      expiresAt: Date.now() + cacheTtlMs,
    });
    if (useDiskCache) {
      writeDiskCache(key, html, res.status);
    }
    return { url, status: res.status, html };
  } catch (err) {
    return {
      url,
      status: null,
      html: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export class ProbeRequestBudget {
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
