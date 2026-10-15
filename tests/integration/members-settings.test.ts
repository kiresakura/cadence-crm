import { beforeAll, describe, expect, it } from "vitest";

import { membersSettings } from "@/server/services/members";

import { createTestWorkspace, type TestWorkspace } from "./helpers";

describe("members settings page", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("loads nothing for members and viewers, whom the settings layout turns away", async () => {
    await expect(membersSettings(ws.member)).resolves.toBeNull();
    await expect(membersSettings(ws.viewer)).resolves.toBeNull();
  });

  it("lists members and pending invitations for owners and admins", async () => {
    for (const ctx of [ws.owner, ws.admin]) {
      const settings = await membersSettings(ctx);
      expect(settings?.members).toHaveLength(4);
      expect(settings?.invitations).toEqual([]);
    }
  });
});
