import { randomBytes } from "node:crypto";

import type { Role } from "@/generated/prisma/enums";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import type { Ctx } from "@/server/permissions";
import { insertWorkspace } from "@/server/services/workspaces";

export const TEST_PASSWORD = "correct-horse-battery";
let passwordHash: Promise<string> | undefined;

export function uid(): string {
  return randomBytes(4).toString("hex");
}

export async function createUser(name = "Test User") {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  return db.user.create({
    data: {
      email: `user-${uid()}@test.example`,
      name,
      passwordHash: await passwordHash,
    },
  });
}

export interface TestWorkspace {
  workspaceId: string;
  owner: Ctx;
  admin: Ctx;
  member: Ctx;
  viewer: Ctx;
  pipelineId: string;
  stages: Array<{ id: string; name: string; type: string; probability: number }>;
}

/** A workspace with one user per role and the default pipeline. */
export async function createTestWorkspace(name = `Workspace ${uid()}`): Promise<TestWorkspace> {
  const owner = await createUser("Owner");
  const workspace = await db.$transaction((tx) => insertWorkspace(tx, { name, ownerId: owner.id }));
  const ctxFor = (userId: string, role: Role): Ctx => ({
    userId,
    workspaceId: workspace.id,
    role,
  });
  const others: Partial<Record<Role, Ctx>> = {};
  for (const role of ["ADMIN", "MEMBER", "VIEWER"] as const) {
    const user = await createUser(role.toLowerCase());
    await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role } });
    others[role] = ctxFor(user.id, role);
  }
  const pipeline = await db.pipeline.findFirstOrThrow({
    where: { workspaceId: workspace.id },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  return {
    workspaceId: workspace.id,
    owner: ctxFor(owner.id, "OWNER"),
    admin: others.ADMIN as Ctx,
    member: others.MEMBER as Ctx,
    viewer: others.VIEWER as Ctx,
    pipelineId: pipeline.id,
    stages: pipeline.stages,
  };
}

export function stageByName(ws: TestWorkspace, name: string) {
  const stage = ws.stages.find((candidate) => candidate.name === name);
  if (!stage) throw new Error(`No stage named ${name}`);
  return stage;
}
