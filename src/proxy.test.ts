import { describe, expect, it } from "vitest";

import { config } from "./proxy";

// The matcher source is a regular expression over the path (path-to-regexp group syntax).
const matches = (path: string) =>
  config.matcher.some((entry) => new RegExp(`^${entry.source}$`).test(path));

describe("security header proxy", () => {
  it("runs for pages", () => {
    for (const path of ["/", "/login", "/dashboard", "/invite/abc", "/contacts/x/edit"]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("does not run for the JSON API or build assets, so their bodies are never buffered", () => {
    for (const path of ["/api/contacts", "/api/health", "/_next/static/chunk.js", "/favicon.ico"]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
