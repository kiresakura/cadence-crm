import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP-recommended baseline (19 MiB, 2 iterations, 1 lane).
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown, so both paths cost the same.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-real-password-used-for-timing");
  return dummyHash;
}

/** Readable temporary password for invited members, e.g. `amber-river-4821`. */
export function generateTemporaryPassword(random: () => number = Math.random): string {
  const words = [
    "amber",
    "cedar",
    "delta",
    "ember",
    "fable",
    "harbor",
    "lumen",
    "maple",
    "nova",
    "orbit",
    "pixel",
    "quartz",
    "river",
    "summit",
    "tango",
    "willow",
  ];
  const pick = () => words[Math.floor(random() * words.length)] ?? "nova";
  const digits = String(Math.floor(random() * 9000) + 1000);
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}
