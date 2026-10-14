import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-redirect";

describe("post-login destination", () => {
  it.each([
    ["/contacts", "/contacts"],
    ["/contacts?page=2&q=ada", "/contacts?page=2&q=ada"],
    ["/deals/abc#notes", "/deals/abc#notes"],
    ["/contacts?q=a#top", "/contacts?q=a#top"],
    ["/invite/AbC-123_xyz", "/invite/AbC-123_xyz"],
  ])("keeps the same-site path %s", (value, expected) => {
    expect(safeNext(value)).toBe(expected);
  });

  it.each([
    "/\\evil.example",
    "/\\evil.example/x",
    "/\\\\evil",
    "\\\\evil",
    "//evil",
    "//evil.example/x",
    "/\t/evil",
    "/\n/evil",
    "/ /evil",
    " /contacts",
    "https://evil",
    "http:/evil",
    "javascript:alert(1)",
    "/.//evil.example",
    "",
  ])("falls back to the dashboard for %j", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });

  it("keeps percent-encoded control characters inside the site", () => {
    const result = safeNext("/%09/evil");
    expect(result.startsWith("/")).toBe(true);
    expect(result.startsWith("//")).toBe(false);
    expect(new URL(result, "https://app.example").origin).toBe("https://app.example");
  });

  it("ignores values that are not strings", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(42)).toBe("/dashboard");
  });
});
