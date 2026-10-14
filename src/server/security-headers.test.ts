import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce, securityHeaders } from "./security-headers";

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values.join(" ")];
    }),
  );
}

describe("content security policy", () => {
  it("allows only this site and scripts carrying the request's nonce", () => {
    const policy = directives(contentSecurityPolicy("abc123", { dev: false }));
    expect(Object.fromEntries(policy)).toEqual({
      "default-src": "'self'",
      "script-src": "'self' 'nonce-abc123' 'strict-dynamic'",
      "style-src": "'self' 'unsafe-inline'",
      "img-src": "'self' data: blob:",
      "font-src": "'self' data:",
      "connect-src": "'self'",
      "object-src": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "frame-ancestors": "'none'",
    });
  });

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy("n", { dev: true })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("n", { dev: false })).not.toContain("unsafe-eval");
  });

  it("uses a fresh, unguessable nonce for every request", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
  });
});

describe("security headers", () => {
  it("adds HSTS only in production", () => {
    const production = securityHeaders({ nonce: "n", production: true, dev: false });
    expect(production["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(production["Content-Security-Policy"]).toContain("'nonce-n'");
    const demo = securityHeaders({ nonce: "n", production: false, dev: false });
    expect(demo["Strict-Transport-Security"]).toBeUndefined();
    expect(Object.keys(demo)).toEqual(["Content-Security-Policy"]);
  });
});
