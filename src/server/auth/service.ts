import { recordAudit } from "../audit";
import { db } from "../db";
import { demoAccountsEnabled, isDemoEmail } from "../env";
import { AppError, ConflictError, ValidationError, parseInput } from "../errors";
import { RateLimiter } from "../rate-limit";
import { isValidTimeZone } from "../domain/tasks";
import { insertWorkspace } from "../services/workspaces";
import { loginSchema, registerSchema } from "../validation/schemas";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { createSession } from "./session";

const INVALID_CREDENTIALS = "Invalid email or password.";

// 10 attempts per email per 15 minutes.
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);

export interface SignedInSession {
  token: string;
  expiresAt: Date;
  userId: string;
  workspaceId: string | null;
}

export async function registerUser(rawInput: unknown): Promise<SignedInSession> {
  const input = parseInput(registerSchema, rawInput);
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

  const session = await createSession(db, { userId: user.id, workspaceId: workspace.id });
  return { ...session, userId: user.id, workspaceId: workspace.id };
}

export async function login(rawInput: unknown): Promise<SignedInSession> {
  const input = parseInput(loginSchema, rawInput);

  if (!loginLimiter.consume(input.email).allowed) {
    throw new AppError("BAD_REQUEST", "Too many sign-in attempts. Try again in a few minutes.");
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
    throw new AppError("UNAUTHENTICATED", INVALID_CREDENTIALS);
  }

  loginLimiter.reset(input.email);
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
