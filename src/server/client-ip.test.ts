import { describe, expect, it } from "vitest";

import { clientIpFrom } from "./client-ip";

const headers = (forwarded?: string) =>
  new Headers(forwarded ? { "x-forwarded-for": forwarded } : {});

describe("client address", () => {
  it("is unknown unless a trusted proxy is configured", () => {
    expect(clientIpFrom(headers("203.0.113.9"), {})).toBeNull();
    expect(clientIpFrom(headers("203.0.113.9"), { TRUST_PROXY: "false" })).toBeNull();
  });

  it("uses the entry the trusted proxy appended", () => {
    expect(clientIpFrom(headers("203.0.113.9"), { TRUST_PROXY: "true" })).toBe("203.0.113.9");
    // A client can send its own header; the proxy appends the real address last.
    expect(clientIpFrom(headers("10.0.0.1, 203.0.113.9"), { TRUST_PROXY: "1" })).toBe(
      "203.0.113.9",
    );
    expect(clientIpFrom(headers(), { TRUST_PROXY: "true" })).toBeNull();
    expect(clientIpFrom(headers("x".repeat(100)), { TRUST_PROXY: "true" })).toBeNull();
  });
});
