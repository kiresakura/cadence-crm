import type { Prisma } from "@/generated/prisma/client";

import { db, type DbClient } from "../db";
import { assertCan, type Ctx } from "../permissions";
import { notFoundUnless } from "./guards";

export type DeletableRecord = "contact" | "company" | "deal";

/** Activities or tasks attached to this record and to no other contact, company or deal. */
function onlyLinkedTo(ctx: Ctx, kind: DeletableRecord, id: string) {
  return {
    workspaceId: ctx.workspaceId,
    contactId: kind === "contact" ? id : null,
    companyId: kind === "company" ? id : null,
    dealId: kind === "deal" ? id : null,
  } satisfies Prisma.ActivityWhereInput & Prisma.TaskWhereInput;
}

async function assertRecord(ctx: Ctx, kind: DeletableRecord, id: string) {
  const where = { id, workspaceId: ctx.workspaceId };
  const select = { id: true };
  const record =
    kind === "contact"
      ? await db.contact.findFirst({ where, select })
      : kind === "company"
        ? await db.company.findFirst({ where, select })
        : await db.deal.findFirst({ where, select });
  notFoundUnless(record, kind[0]!.toUpperCase() + kind.slice(1));
}

/** How many activities and tasks deleting this record would delete with it. */
export async function deletionImpact(ctx: Ctx, kind: DeletableRecord, id: string) {
  assertCan(ctx, "records:read");
  await assertRecord(ctx, kind, id);
  const where = onlyLinkedTo(ctx, kind, id);
  const [activities, tasks] = await Promise.all([
    db.activity.count({ where }),
    db.task.count({ where }),
  ]);
  return { activities, tasks };
}

/**
 * Deletes the activities and tasks that only belong to the record about to be deleted, so
 * nothing is left unreachable. Items also linked elsewhere stay and only lose this link.
 */
export async function deleteOnlyLinked(tx: DbClient, ctx: Ctx, kind: DeletableRecord, id: string) {
  const where = onlyLinkedTo(ctx, kind, id);
  const activities = (await tx.activity.deleteMany({ where })).count;
  const tasks = (await tx.task.deleteMany({ where })).count;
  return { activities, tasks };
}
