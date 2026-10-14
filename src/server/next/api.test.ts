import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { AppError } from "../errors";
import { MAX_JSON_BYTES, readJson } from "./api";

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/contacts", {
    method: "POST",
    body,
    headers,
  }) as unknown as NextRequest;
}

describe("JSON request bodies", () => {
  it("parses bodies within the limit", async () => {
    await expect(readJson(post('{"firstName":"Ada"}'))).resolves.toEqual({ firstName: "Ada" });
  });

  it("answers 413 for bodies over 1 MB, declared or not", async () => {
    const big = JSON.stringify({ notes: "x".repeat(MAX_JSON_BYTES) });
    for (const request of [
      post(big),
      post("{}", { "content-length": String(MAX_JSON_BYTES + 1) }),
    ]) {
      const error = await readJson(request).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(413);
    }
    expect(MAX_JSON_BYTES).toBe(1024 * 1024);
  });

  it("rejects malformed JSON", async () => {
    await expect(readJson(post("{nope"))).rejects.toThrow("Request body must be valid JSON.");
  });
});
