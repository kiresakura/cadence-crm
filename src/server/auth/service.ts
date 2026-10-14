import { recordAudit } from "../audit";
import { db } from "../db";
import { demoAccountsEnabled, isDemoEmail } from "../env";
import { AppError, ConflictError, ValidationError, parseInput } from "../errors";
import { RateLimiter } from "../rate-limit";
import { isValidTimeZone } from "../domain/tasks";
import { insertWorkspace } from "../services/workspaces";
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from "../validation/schemas";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { createSession, deleteSessionByToken } from "./session";

const INVALID_CREDENTIALS = "Invalid email or password.";
const TOO_MANY_SIGN_INS = "Too many sign-in attempts. Try again in a few minutes.";

/**
 * Failed sign-ins allowed per 15 minutes, counted three ways:
 * - per email and client address: someone guessing at one account from one place;
 * - per client address across accounts: one address trying a password on many accounts;
 * - per email across addresses, set higher: guesses spread over many addresses.
 * Failures from other addresses therefore cannot lock a user out of their own address before
 * the higher per-email limit. Without a known client address (see `clientIpFrom`), only the
 * per-email limits apply, and the stricter one of them counts every failure.
 */
export const LOGIN_LIMITS = { perEmailAndIp: 10, perIp: 30, perEmail: 50 } as const;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = {
  pair: new RateLimiter(LOGIN_LIMITS.perEmailAndIp, LOGIN_WINDOW_MS),
  ip: new RateLimiter(LOGIN_LIMITS.perIp, LOGIN_WINDOW_MS),
  email: new RateLimiter(LOGIN_LIMITS.perEmail, LOGIN_WINDOW_MS),
};

/** Sign-ups per client address per hour. */
export const REGISTRATION_LIMIT = 10;
const registrations = new RateLimiter(REGISTRATION_LIMIT, 60 * 60 * 1000);

export interface ClientInfo {
  /** Client address from `clientIpFrom`, or null when unknown. */
  ip?: string | null;
  /** Session token the browser already holds; it is revoked when a new session starts. */
  previousToken?: string | null;
}

export interface SignedInSession {
  token: string;
  expiresAt: Date;
  userId: string;
  workspaceId: string | null;
}

export async function registerUser(
  rawInput: unknown,
  client: ClientInfo = {},
): Promise<SignedInSession> {
  const input = parseInput(registerSchema, rawInput);
  if (client.ip && !registrations.consume(client.ip).allowed) {
    throw new AppError("BAD_REQUEST", "Too many sign-ups from your network. Try again later.");
  }
  if (isDemoEmail(input.email)) {
    throw ValidationError.forField("email", "This email domain is reserved for demo accounts.");
  }
  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("An account with this email already exists.", {
      email: ["An account with this email already exists."],
    });
  }
  const passwordHash = await hashPassword(input.password);
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "UTC";

  const { user, workspace } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash, timezone },
    });
    const workspace = await insertWorkspace(tx, { name: input.workspaceName, ownerId: user.id });
    await recordAudit(
      tx,
      { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
      {
        action: "workspace.created",
        entityType: "workspace",
        entityId: workspace.id,
        changes: { name: workspace.name },
      },
    );
    return { user, workspace };
  });

  if (client.previousToken) await deleteSessionByToken(db, client.previousToken);
  const session = await createSession(db, { userId: user.id, workspaceId: workspace.id });
  return { ...session, userId: user.id, workspaceId: workspace.id };
}

export async function login(rawInput: unknown, client: ClientInfo = {}): Promise<SignedInSession> {
  const input = parseInput(loginSchema, rawInput);
  const ip = client.ip ?? null;
  const counters: Array<[RateLimiter, string]> = [
    [loginFailures.pair, `${input.email}|${ip ?? "unknown"}`],
    [loginFailures.email, input.email],
  ];
  if (ip) counters.push([loginFailures.ip, ip]);
  if (counters.some(([limiter, key]) => !limiter.check(key).allowed)) {
    throw new AppError("BAD_REQUEST", TOO_MANY_SIGN_INS);
  }

  const user =
    isDemoEmail(input.email) && !demoAccountsEnabled()
      ? null
      : await db.user.findUnique({ where: { email: input.email } });

  // Verify against a dummy hash for unknown users so response times do not reveal accounts.
  const valid = user
    ? await verifyPassword(user.passwordHash, input.password)
    : (await verifyPassword(await getDummyHash(), input.password)) && false;
  if (!user || !valid) {
    for (const [limiter, key] of counters) limiter.hit(key);
    throw new AppError("UNAUTHENTICATED", INVALID_CREDENTIALS);
  }

  loginFailures.pair.reset(counters[0]![1]);
  if (client.previousToken) await deleteSessionByToken(db, client.previousToken);
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  const session = await createSession(db, {
    userId: user.id,
    workspaceId: membership?.workspaceId ?? null,
  });
  return { ...session, userId: user.id, workspaceId: membership?.workspaceId ?? null };
}

/** Updates the signed-in user's display name and time zone. */
export async function updateProfile(userId: string, rawInput: unknown) {
  const input = parseInput(profileSchema, rawInput);
  if (!isValidTimeZone(input.timezone)) {
    throw ValidationError.forField("timezone", "Choose a valid time zone.");
  }
  return db.user.update({
    where: { id: userId },
    data: { name: input.name, timezone: input.timezone },
    select: { id: true, name: true, timezone: true },
  });
}

/**
 * Changes the password after verifying the current one, then signs out every other session
 * so a leaked password stops working everywhere else.
 */
export async function changePassword(userId: string, currentSessionId: string, rawInput: unknown) {
  const input = parseInput(changePasswordSchema, rawInput);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw ValidationError.forField("currentPassword", "Your current password is not correct.");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId, id: { not: currentSessionId } } }),
  ]);
}
