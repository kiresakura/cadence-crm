import { describe, expect, it } from "vitest";

import {
  InsecureConfigError,
  assertSafeToStart,
  demoAccountsEnabled,
  findInsecureConfig,
  getAppEnv,
  getAuthSecret,
  isDemoEmail,
  shouldUseSecureCookies,
} from "./env";

const STRONG_SECRET = "k3P9vX2mQ8wL5nR7tY1zA4bC6dE0fG2hJ";
const SAFE_DB = "postgresql://crm:Xy7-strong-pass@db.internal:5432/crm";

describe("getAppEnv", () => {
  it("prefers APP_ENV over NODE_ENV", () => {
    expect(getAppEnv({ APP_ENV: "demo", NODE_ENV: "production" })).toBe("demo");
  });

  it("falls back to NODE_ENV", () => {
    expect(getAppEnv({ NODE_ENV: "production" })).toBe("production");
    expect(getAppEnv({ NODE_ENV: "test" })).toBe("test");
    expect(getAppEnv({})).toBe("development");
  });

  it("treats unknown values as production", () => {
    expect(getAppEnv({ APP_ENV: "staging" })).toBe("production");
  });
});

describe("secret guard", () => {
  it("accepts a strong production configuration", () => {
    const env = { APP_ENV: "production", AUTH_SECRET: STRONG_SECRET, DATABASE_URL: SAFE_DB };
    expect(findInsecureConfig(env)).toEqual([]);
    expect(() => assertSafeToStart(env)).not.toThrow();
  });

  it("refuses to start production with the example secret", () => {
    const env = {
      APP_ENV: "production",
      AUTH_SECRET: "replace-with-a-long-random-string-for-local-dev",
      DATABASE_URL: SAFE_DB,
    };
    expect(() => assertSafeToStart(env)).toThrow(InsecureConfigError);
    expect(findInsecureConfig(env)).toEqual(["AUTH_SECRET still uses a placeholder value."]);
  });

  it("rejects missing, short and placeholder-looking secrets", () => {
    expect(findInsecureConfig({ DATABASE_URL: SAFE_DB })).toContain("AUTH_SECRET is not set.");
    expect(findInsecureConfig({ AUTH_SECRET: "short", DATABASE_URL: SAFE_DB })).toContain(
      "AUTH_SECRET must be at least 32 characters long.",
    );
    expect(
      findInsecureConfig({
        AUTH_SECRET: "please-change-me-before-going-live-123",
        DATABASE_URL: SAFE_DB,
      }),
    ).toContain("AUTH_SECRET still uses a placeholder value.");
  });

  it("rejects default database passwords", () => {
    const problems = findInsecureConfig({
      AUTH_SECRET: STRONG_SECRET,
      DATABASE_URL: "postgresql://cadence:cadence@db:5432/cadence",
    });
    expect(problems).toEqual(["DATABASE_URL uses an empty or default database password."]);
    expect(findInsecureConfig({ AUTH_SECRET: STRONG_SECRET, DATABASE_URL: "not a url" })).toEqual([
      "DATABASE_URL is not a valid connection URL.",
    ]);
  });

  it("does not block non-production environments", () => {
    expect(() => assertSafeToStart({ APP_ENV: "demo", AUTH_SECRET: "x" })).not.toThrow();
    expect(() => assertSafeToStart({ APP_ENV: "development" })).not.toThrow();
  });

  it("lists every problem in the error message", () => {
    try {
      assertSafeToStart({ APP_ENV: "production" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InsecureConfigError);
      expect((error as InsecureConfigError).problems).toHaveLength(2);
    }
  });
});

describe("demo accounts", () => {
  it("are only enabled outside production", () => {
    expect(demoAccountsEnabled({ APP_ENV: "demo" })).toBe(true);
    expect(demoAccountsEnabled({ APP_ENV: "development" })).toBe(true);
    expect(demoAccountsEnabled({ APP_ENV: "production" })).toBe(false);
  });

  it("are recognised by their reserved domain", () => {
    expect(isDemoEmail("Owner@Demo.Local")).toBe(true);
    expect(isDemoEmail("owner@example.com")).toBe(false);
  });
});

describe("getAuthSecret and cookies", () => {
  it("uses a development fallback only outside production", () => {
    expect(getAuthSecret({ APP_ENV: "development" })).toMatch(/development/);
    expect(() => getAuthSecret({ APP_ENV: "production" })).toThrow(InsecureConfigError);
    expect(getAuthSecret({ AUTH_SECRET: STRONG_SECRET })).toBe(STRONG_SECRET);
  });

  it("marks cookies Secure in production or behind https", () => {
    expect(shouldUseSecureCookies({ APP_ENV: "production" })).toBe(true);
    expect(shouldUseSecureCookies({ APP_ENV: "demo", APP_URL: "https://crm.example.com" })).toBe(
      true,
    );
    expect(shouldUseSecureCookies({ APP_ENV: "demo", APP_URL: "http://localhost:3100" })).toBe(
      false,
    );
  });
});
