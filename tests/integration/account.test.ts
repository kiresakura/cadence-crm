import { describe, expect, it } from "vitest";

import { changePassword, login, updateProfile } from "@/server/auth/service";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

import { TEST_PASSWORD, createUser } from "./helpers";

describe("account settings", () => {
  it("updates the display name and time zone", async () => {
    const user = await createUser("Before");
    const updated = await updateProfile(user.id, { name: "After", timezone: "Asia/Taipei" });
    expect(updated).toMatchObject({ name: "After", timezone: "Asia/Taipei" });
    await expect(
      updateProfile(user.id, { name: "After", timezone: "Mars/Olympus" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(updateProfile(user.id, { name: "", timezone: "UTC" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("changes the password and signs out every other session", async () => {
    const user = await createUser();
    const current = await createSession(db, { userId: user.id, workspaceId: null });
    const other = await createSession(db, { userId: user.id, workspaceId: null });
    const currentSession = await validateSessionToken(db, current.token);

    await expect(
      changePassword(user.id, currentSession!.id, {
        currentPassword: "wrong-password",
        newPassword: "a-brand-new-password",
      }),
    ).rejects.toThrow("Your current password is not correct.");
    await expect(
      changePassword(user.id, currentSession!.id, {
        currentPassword: TEST_PASSWORD,
        newPassword: TEST_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      changePassword(user.id, currentSession!.id, {
        currentPassword: TEST_PASSWORD,
        newPassword: "short",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await changePassword(user.id, currentSession!.id, {
      currentPassword: TEST_PASSWORD,
      newPassword: "a-brand-new-password",
    });
    expect(await validateSessionToken(db, current.token)).not.toBeNull();
    expect(await validateSessionToken(db, other.token)).toBeNull();
    await expect(login({ email: user.email, password: TEST_PASSWORD })).rejects.toThrow(
      "Invalid email or password.",
    );
    await expect(
      login({ email: user.email, password: "a-brand-new-password" }),
    ).resolves.toMatchObject({ userId: user.id });
  });
});
