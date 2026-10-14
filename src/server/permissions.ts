import type { Role } from "@/generated/prisma/enums";

import { ForbiddenError } from "./errors";

/**
 * The caller of every service function: who is acting, in which workspace, with which role.
 * Services never trust a workspace id coming from the client; it always comes from here.
 */
export interface Ctx {
  userId: string;
  workspaceId: string;
  role: Role;
}

export type Permission =
  | "records:read"
  | "records:write"
  | "settings:manage"
  | "members:manage"
  | "audit:read"
  | "workspace:manage";

const MATRIX: Record<Permission, readonly Role[]> = {
  "records:read": ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
  "records:write": ["OWNER", "ADMIN", "MEMBER"],
  "settings:manage": ["OWNER", "ADMIN"],
  "members:manage": ["OWNER", "ADMIN"],
  "audit:read": ["OWNER", "ADMIN"],
  "workspace:manage": ["OWNER"],
};

export const ROLE_ORDER: readonly Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

export function assertCan(ctx: Ctx, permission: Permission): void {
  if (!can(ctx.role, permission)) {
    throw new ForbiddenError();
  }
}

/** Capability flags handed to the UI so it can hide controls the server would reject anyway. */
export function capabilitiesFor(role: Role) {
  return {
    canWrite: can(role, "records:write"),
    canManageSettings: can(role, "settings:manage"),
    canManageMembers: can(role, "members:manage"),
    canReadAudit: can(role, "audit:read"),
    canManageWorkspace: can(role, "workspace:manage"),
  };
}

export type Capabilities = ReturnType<typeof capabilitiesFor>;
