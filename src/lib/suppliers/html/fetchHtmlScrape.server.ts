import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const HTML_SCRAPE_EXEC_USER_AGENT =
  "Agora/1.0 (+supplier-discovery; html-scrape-exec)";

export const DEFAULT_HTML_SCRAPE_TIMEOUT_MS = 15_000;
export const DEFAULT_HTML_SCRAPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = join(process.cwd(), "scripts", "cache", "html-scrape-exec");

export type HtmlScrapeFetchResult = {
  url: string;
  status: number | null;
  html: string;
  error?: string;
};

export type HtmlScrapeFetchDeps = {
  fetchFn?: (
    url: string,
    init: RequestInit
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  timeoutMs?: number;
  cacheTtlMs?: number;
  useDiskCache?: boolean;
};

let memoryCache = new Map<
  string,
  { body: string; status: number; expiresAt: number }
>();

export function resetHtmlScrapeFetchCacheForTests() {
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

export async function fetchHtmlScrapeUrl(
  url: string,
  deps?: HtmlScrapeFetchDeps
): Promise<HtmlScrapeFetchResult> {
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_HTML_SCRAPE_TIMEOUT_MS;
  const cacheTtlMs = deps?.cacheTtlMs ?? DEFAULT_HTML_SCRAPE_CACHE_TTL_MS;
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
      return { status: res.status, text: () => res.text() };
    });

  try {
    const res = await fetchFn(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*",
        "User-Agent": HTML_SCRAPE_EXEC_USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await res.text();
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

export class HtmlScrapeRequestBudget {
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

export async function fetchHtmlScrapeUrlsParallel(
  urls: string[],
  deps: HtmlScrapeFetchDeps | undefined,
  concurrency: number
): Promise<HtmlScrapeFetchResult[]> {
  const results: HtmlScrapeFetchResult[] = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const current = urls[index];
      index += 1;
      results.push(await fetchHtmlScrapeUrl(current, deps));
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
