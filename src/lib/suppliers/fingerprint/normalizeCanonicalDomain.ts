/**
 * Normalize Supplier.domain to a lowercase host (no protocol, www, or path).
 * Pure — no network calls.
 */
export function normalizeCanonicalDomain(
  domain: string | null | undefined
): string | null {
  if (domain == null) return null;

  let value = domain.trim();
  if (!value) return null;

  const markdownUrl = value.match(/\[[^\]]*\]\(([^)]+)\)/);
  if (markdownUrl) {
    value = markdownUrl[1].trim();
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    return host || null;
  } catch {
    let fallback = value.toLowerCase();
    fallback = fallback.replace(/^https?:\/\//, "");
    fallback = fallback.replace(/^www\./, "");
    fallback = fallback.split("/")[0] ?? "";
    fallback = fallback.split("?")[0] ?? "";
    fallback = fallback.split("#")[0] ?? "";
    fallback = fallback.trim();
    return fallback || null;
  }
}
