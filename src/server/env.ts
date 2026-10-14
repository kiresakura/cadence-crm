/**
 * Runtime configuration and the production "secret guard".
 *
 * `APP_ENV` describes the deployment (development, test, demo, production) and is
 * independent of `NODE_ENV`, which only describes how the code was built. The Docker
 * demo runs a production build with `APP_ENV=demo`, so demo accounts keep working there,
 * while a real deployment (`APP_ENV=production`) refuses to start with placeholder
 * secrets and rejects demo logins.
 */

export const APP_ENVS = ["development", "test", "demo", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

type Env = Record<string, string | undefined>;

/** Placeholder secrets that ship in this repository (.env.example, compose files, tests). */
export const KNOWN_PLACEHOLDER_SECRETS: readonly string[] = [
  "replace-with-a-long-random-string-for-local-dev",
  "demo-only-insecure-secret-do-not-use-in-production",
  "test-only-auth-secret-that-is-long-enough-0000",
  "insecure-development-only-auth-secret",
];

const PLACEHOLDER_PATTERN = /change[-_ ]?me|replace[-_ ]?with|placeholder|insecure|do-not-use/i;

/** Database passwords that must never reach production. */
export const KNOWN_DEFAULT_DB_PASSWORDS: readonly string[] = [
  "cadence",
  "postgres",
  "password",
  "changeme",
  "admin",
];

export const DEMO_EMAIL_DOMAIN = "demo.local";

export class InsecureConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Refusing to start in production with an insecure configuration:\n- ${problems.join("\n- ")}`,
    );
    this.name = "InsecureConfigError";
  }
}

export function getAppEnv(env: Env = process.env): AppEnv {
  const value = env.APP_ENV?.trim();
  if (value) {
    if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
    // Unknown values fall back to the strictest mode.
    return "production";
  }
  if (env.NODE_ENV === "production") return "production";
  if (env.NODE_ENV === "test") return "test";
  return "development";
}

export function isProduction(env: Env = process.env): boolean {
  return getAppEnv(env) === "production";
}

/** Lists every reason the configuration is unsafe for production. */
export function findInsecureConfig(env: Env = process.env): string[] {
  const problems: string[] = [];

  const secret = env.AUTH_SECRET;
  if (!secret) {
    problems.push("AUTH_SECRET is not set.");
  } else if (secret.length < 32) {
    problems.push("AUTH_SECRET must be at least 32 characters long.");
  } else if (KNOWN_PLACEHOLDER_SECRETS.includes(secret) || PLACEHOLDER_PATTERN.test(secret)) {
    problems.push("AUTH_SECRET still uses a placeholder value.");
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set.");
  } else {
    try {
      const password = decodeURIComponent(new URL(databaseUrl).password);
      if (!password || KNOWN_DEFAULT_DB_PASSWORDS.includes(password.toLowerCase())) {
        problems.push("DATABASE_URL uses an empty or default database password.");
      }
    } catch {
      problems.push("DATABASE_URL is not a valid connection URL.");
    }
  }

  if (env.APP_ENV && !(APP_ENVS as readonly string[]).includes(env.APP_ENV)) {
    problems.push(`APP_ENV must be one of: ${APP_ENVS.join(", ")}.`);
  }

  return problems;
}

/** Throws when running as production with placeholder or missing secrets. */
export function assertSafeToStart(env: Env = process.env): void {
  if (!isProduction(env)) return;
  const problems = findInsecureConfig(env);
  if (problems.length > 0) throw new InsecureConfigError(problems);
}

/** Demo accounts (`@demo.local`) only work outside production. */
export function demoAccountsEnabled(env: Env = process.env): boolean {
  return !isProduction(env);
}

export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export function getAuthSecret(env: Env = process.env): string {
  const secret = env.AUTH_SECRET;
  if (secret) return secret;
  if (isProduction(env)) throw new InsecureConfigError(["AUTH_SECRET is not set."]);
  return "insecure-development-only-auth-secret";
}

/** Session cookies are `Secure` in production and whenever the public URL is https. */
export function shouldUseSecureCookies(env: Env = process.env): boolean {
  return isProduction(env) || (env.APP_URL ?? "").startsWith("https://");
}
