import { gunzipSync } from "node:zlib";

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

export function isGzipSitemapUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0]?.split("#")[0] ?? "";
  return lower.endsWith(".gz");
}

function hasGzipMagic(body: Buffer): boolean {
  return body.length >= 2 && body.subarray(0, 2).equals(GZIP_MAGIC);
}

function isContentEncodingGzip(contentEncoding: string | null | undefined): boolean {
  if (!contentEncoding) return false;
  return contentEncoding.toLowerCase().includes("gzip");
}

/**
 * Normalize a sitemap HTTP body to UTF-8 XML text.
 * Handles .xml.gz files (Shopware-style) and Content-Encoding: gzip.
 */
export function decompressSitemapBody(
  body: Buffer,
  url: string,
  contentEncoding?: string | null
): string {
  const shouldGunzip =
    hasGzipMagic(body) ||
    isGzipSitemapUrl(url) ||
    isContentEncodingGzip(contentEncoding);

  if (!shouldGunzip) {
    return body.toString("utf8");
  }

  try {
    return gunzipSync(body).toString("utf8");
  } catch {
    return "";
  }
}
