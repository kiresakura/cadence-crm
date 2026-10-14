import { randomBytes } from "node:crypto";

import { recordAudit } from "../audit";
import { setSessionWorkspace } from "../auth/session";
import { db, type DbClient } from "../db";
import { ForbiddenError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { workspaceSchema } from "../validation/schemas";
import { insertPipelineWithDefaults } from "./pipelines";

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${randomBytes(3).toString("hex")}`;
}

/** Creates a workspace with the caller as OWNER and a ready-to-use sales pipeline. */
export async function insertWorkspace(tx: DbClient, input: { name: string; ownerId: string }) {
  const workspace = await tx.workspace.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      memberships: { create: { userId: input.ownerId, role: "OWNER" } },
    },
  });
  await insertPipelineWithDefaults(tx, workspace.id, "Sales", 0);
  return workspace;
}

export async function createWorkspace(userId: string, rawInput: unknown) {
  const input = parseInput(workspaceSchema, rawInput);
  return db.$transaction(async (tx) => {
    const workspace = await insertWorkspace(tx, { name: input.name, ownerId: userId });
    await recordAudit(
      tx,
      { userId, workspaceId: workspace.id, role: "OWNER" },
      {
        action: "workspace.created",
        entityType: "workspace",
        entityId: workspace.id,
        changes: { name: workspace.name },
      },
    );
    return workspace;
  });
}

export async function listUserWorkspaces(userId: string) {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role,
  }));
}

/** Points the session at another workspace, but only one the user belongs to. */
export async function switchWorkspace(sessionId: string, userId: string, workspaceId: string) {
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  if (!membership) throw new ForbiddenError("You are not a member of that workspace.");
  await setSessionWorkspace(db, sessionId, workspaceId);
}

export async function renameWorkspace(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "workspace:manage");
  const input = parseInput(workspaceSchema, rawInput);
  return db.$transaction(async (tx) => {
    const before = await tx.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    const workspace = await tx.workspace.update({
      where: { id: ctx.workspaceId },
      data: { name: input.name },
    });
    await recordAudit(tx, ctx, {
      action: "workspace.renamed",
      entityType: "workspace",
      entityId: workspace.id,
      changes: { name: { from: before.name, to: workspace.name } },
    });
    return workspace;
  });
}
