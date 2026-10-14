import { describe, expect, it } from "vitest";

import { LOGIN_LIMITS, login, registerUser } from "@/server/auth/service";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { createInvitation, registerWithInvitation } from "@/server/services/invitations";

import { TEST_PASSWORD, createTestWorkspace, createUser, inviteToken, uid } from "./helpers";

const ip = () => `198.51.100.${Math.floor(Math.random() * 200) + 1}-${uid()}`;

async function failTimes(email: string, from: string, times: number) {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await expect(login({ email, password: "wrong-password" }, { ip: from })).rejects.toThrow(
      "Invalid email or password.",
    );
  }
}

describe("sign-in limits", () => {
  it("does not lock the real user out because of someone else's failures", async () => {
    const user = await createUser("Target");
    const attacker = ip();
    await failTimes(user.email, attacker, LOGIN_LIMITS.perEmailAndIp);
    await expect(
      login({ email: user.email, password: "wrong-password" }, { ip: attacker }),
    ).rejects.toThrow(/Too many/);
    // The owner, from their own address and with the right password, still gets in.
    await expect(
      login({ email: user.email, password: TEST_PASSWORD }, { ip: ip() }),
    ).resolves.toMatchObject({ userId: user.id });
  });

  it("stops one address from trying passwords across many accounts", async () => {
    const sprayer = ip();
    for (let account = 0; account < LOGIN_LIMITS.perIp; account += 1) {
      await expect(
        login({ email: `spray-${uid()}@example.com`, password: "Winter2026!" }, { ip: sprayer }),
      ).rejects.toThrow("Invalid email or password.");
    }
    const user = await createUser("Next target");
    await expect(
      login({ email: user.email, password: TEST_PASSWORD }, { ip: sprayer }),
    ).rejects.toThrow(/Too many/);
  });

  it("caps guesses for one account spread over many addresses", async () => {
    const user = await createUser("Popular");
    for (let attempt = 0; attempt < LOGIN_LIMITS.perEmail; attempt += 1) {
      await expect(
        login({ email: user.email, password: "wrong-password" }, { ip: ip() }),
      ).rejects.toThrow("Invalid email or password.");
    }
    await expect(
      login({ email: user.email, password: TEST_PASSWORD }, { ip: ip() }),
    ).rejects.toThrow(/Too many/);
    expect(LOGIN_LIMITS.perEmail).toBeGreaterThan(LOGIN_LIMITS.perEmailAndIp);
  });

  it("falls back to the per-account limit when the address is unknown", async () => {
    const user = await createUser("No address");
    for (let attempt = 0; attempt < LOGIN_LIMITS.perEmailAndIp; attempt += 1) {
      await expect(login({ email: user.email, password: "bad" })).rejects.toThrow(
        "Invalid email or password.",
      );
    }
    await expect(login({ email: user.email, password: TEST_PASSWORD })).rejects.toThrow(/Too many/);
  });

  it("revokes the session the browser already had when signing in again", async () => {
    const user = await createUser("Switcher");
    const previous = await createSession(db, { userId: user.id, workspaceId: null });
    const fresh = await login(
      { email: user.email, password: TEST_PASSWORD },
      { ip: ip(), previousToken: previous.token },
    );
    expect(await validateSessionToken(db, previous.token)).toBeNull();
    expect(await validateSessionToken(db, fresh.token)).not.toBeNull();
  });
});

describe("registration limits", () => {
  it("limits sign-ups from one address but still says when an email is taken", async () => {
    const from = ip();
    for (let n = 0; n < 10; n += 1) {
      await registerUser(
        {
          name: "Burst",
          email: `burst-${uid()}@example.com`,
          password: "a-long-password",
          workspaceName: "Burst",
        },
        { ip: from },
      );
    }
    await expect(
      registerUser(
        {
          name: "One more",
          email: `burst-${uid()}@example.com`,
          password: "a-long-password",
          workspaceName: "Burst",
        },
        { ip: from },
      ),
    ).rejects.toThrow(/Too many sign-ups/);

    const taken = await createUser("Taken");
    await expect(
      registerUser(
        { name: "Dup", email: taken.email, password: "a-long-password", workspaceName: "X" },
        { ip: ip() },
      ),
    ).rejects.toThrow("An account with this email already exists.");
  });

  it("refuses email addresses longer than 254 characters", async () => {
    const long = `${"a".repeat(250)}@example.com`;
    await expect(login({ email: long, password: "x" }, { ip: ip() })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      registerUser({ name: "Long", email: long, password: "a-long-password", workspaceName: "X" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const ws = await createTestWorkspace();
    await expect(
      createInvitation(ws.owner, { email: long, role: "MEMBER" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const { inviteUrl } = await createInvitation(ws.owner, {
      email: `ok-${uid()}@example.com`,
      role: "MEMBER",
    });
    await expect(
      registerWithInvitation({ token: inviteToken(inviteUrl), name: "", password: "short" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
