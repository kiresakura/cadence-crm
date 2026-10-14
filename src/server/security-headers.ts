/**
 * Content Security Policy and HSTS, set per request by `src/proxy.ts`.
 *
 * Scripts must carry the request's nonce ('strict-dynamic' lets them load further chunks);
 * Next.js adds the nonce to its own scripts when it sees this header on the request. Styles
 * allow inline attributes because the UI libraries position elements with inline styles.
 */
export function contentSecurityPolicy(nonce: string, { dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    // React only needs eval in development, to rebuild server error stacks in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 128 random bits, base64-encoded. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function securityHeaders(options: {
  nonce: string;
  production: boolean;
  dev: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(options.nonce, { dev: options.dev }),
  };
  // Production is served over HTTPS; browsers then refuse plain HTTP for two years.
  if (options.production) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  }
  return headers;
}
