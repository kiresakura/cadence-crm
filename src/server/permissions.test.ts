import { describe, expect, it } from "vitest";

import { ForbiddenError } from "./errors";
import { assertCan, can, capabilitiesFor, type Permission } from "./permissions";

const expected: Record<Permission, string[]> = {
  "records:read": ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
  "records:write": ["OWNER", "ADMIN", "MEMBER"],
  "settings:manage": ["OWNER", "ADMIN"],
  "members:manage": ["OWNER", "ADMIN"],
  "audit:read": ["OWNER", "ADMIN"],
  "workspace:manage": ["OWNER"],
};

describe("permission matrix", () => {
  for (const [permission, roles] of Object.entries(expected) as Array<[Permission, string[]]>) {
    for (const role of ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const) {
      const allowed = roles.includes(role);
      it(`${role} ${allowed ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it("assertCan throws a ForbiddenError", () => {
    const viewer = { userId: "u", workspaceId: "w", role: "VIEWER" as const };
    expect(() => assertCan(viewer, "records:write")).toThrow(ForbiddenError);
    expect(() => assertCan(viewer, "records:read")).not.toThrow();
  });

  it("exposes UI capabilities per role", () => {
    expect(capabilitiesFor("VIEWER")).toEqual({
      canWrite: false,
      canManageSettings: false,
      canManageMembers: false,
      canReadAudit: false,
      canManageWorkspace: false,
    });
    expect(capabilitiesFor("MEMBER").canWrite).toBe(true);
    expect(capabilitiesFor("ADMIN").canManageSettings).toBe(true);
    expect(capabilitiesFor("OWNER").canManageWorkspace).toBe(true);
  });
});
