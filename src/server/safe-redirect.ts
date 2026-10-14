const FALLBACK = "/dashboard";

// Placeholder origin used to resolve the value; any other origin means the value left the site.
const SITE_ORIGIN = "https://cadence.invalid";

/**
 * Returns a same-site path for a post-login `next` parameter, or the dashboard.
 *
 * Browsers strip tabs and newlines from URLs and treat `\` like `/`, so `/\t/evil` and
 * `/\evil` both become `//evil` (another host). Values with whitespace, control characters
 * or backslashes are rejected outright; everything else is resolved against a placeholder
 * origin and only the path, query and hash are kept.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return FALLBACK;
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return FALLBACK;

  let url: URL;
  try {
    url = new URL(value, SITE_ORIGIN);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== SITE_ORIGIN) return FALLBACK;

  const path = `${url.pathname}${url.search}${url.hash}`;
  // `/.//host` normalises to `//host`, which a browser would read as another site.
  return path.startsWith("//") ? FALLBACK : path;
}
