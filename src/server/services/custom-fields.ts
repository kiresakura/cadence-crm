import type { CustomFieldEntity } from "@/generated/prisma/enums";

import { recordAudit } from "../audit";
import { db } from "../db";
import { customFieldKeyFromLabel } from "../domain/custom-fields";
import { ConflictError, ValidationError, parseInput } from "../errors";
import { assertCan, type Ctx } from "../permissions";
import { customFieldDefinitionSchema } from "../validation/schemas";
import { notFoundUnless } from "./guards";

export async function listFieldDefinitions(ctx: Ctx, entityType?: CustomFieldEntity) {
  assertCan(ctx, "records:read");
  return db.customFieldDefinition.findMany({
    where: { workspaceId: ctx.workspaceId, ...(entityType ? { entityType } : {}) },
    orderBy: [{ entityType: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });
}

export async function createFieldDefinition(ctx: Ctx, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const input = parseInput(customFieldDefinitionSchema, rawInput);
  const key = input.key ?? customFieldKeyFromLabel(input.label);
  const clash = await db.customFieldDefinition.findUnique({
    where: {
      workspaceId_entityType_key: {
        workspaceId: ctx.workspaceId,
        entityType: input.entityType,
        key,
      },
    },
    select: { id: true },
  });
  if (clash) {
    throw new ConflictError("A field with this key already exists.", {
      label: ["Choose a different label."],
    });
  }
  return db.$transaction(async (tx) => {
    const position = await tx.customFieldDefinition.count({
      where: { workspaceId: ctx.workspaceId, entityType: input.entityType },
    });
    const definition = await tx.customFieldDefinition.create({
      data: {
        workspaceId: ctx.workspaceId,
        entityType: input.entityType,
        key,
        label: input.label,
        type: input.type,
        options: input.type === "SELECT" ? input.options : [],
        required: input.required,
        position,
      },
    });
    await recordAudit(tx, ctx, {
      action: "custom_field.created",
      entityType: "custom_field",
      entityId: definition.id,
      changes: { entityType: definition.entityType, key, type: definition.type },
    });
    return definition;
  });
}

/** Label, options and "required" can change; key and type are fixed once values exist. */
export async function updateFieldDefinition(ctx: Ctx, id: string, rawInput: unknown) {
  assertCan(ctx, "settings:manage");
  const existing = notFoundUnless(
    await db.customFieldDefinition.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
    "Custom field",
  );
  const input = parseInput(customFieldDefinitionSchema, {
    ...(rawInput as Record<string, unknown>),
    entityType: existing.entityType,
    type: existing.type,
  });
  if (input.key && input.key !== existing.key) {
    throw ValidationError.forField("key", "The key of an existing field cannot change.");
  }
  return db.$transaction(async (tx) => {
    const definition = await tx.customFieldDefinition.update({
      where: { id: existing.id },
      data: {
        label: input.label,
        options: existing.type === "SELECT" ? input.options : [],
        required: input.required,
      },
    });
    await recordAudit(tx, ctx, {
      action: "custom_field.updated",
      entityType: "custom_field",
      entityId: definition.id,
      changes: {
        label: { from: existing.label, to: definition.label },
        options: { from: existing.options, to: definition.options },
        required: { from: existing.required, to: definition.required },
      },
    });
    return definition;
  });
}

export async function deleteFieldDefinition(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, "settings:manage");
  await db.$transaction(async (tx) => {
    const existing = notFoundUnless(
      await tx.customFieldDefinition.findFirst({ where: { id, workspaceId: ctx.workspaceId } }),
      "Custom field",
    );
    // Stored values stay in the JSONB column but are ignored and dropped on the next save.
    await tx.customFieldDefinition.delete({ where: { id: existing.id } });
    await recordAudit(tx, ctx, {
      action: "custom_field.deleted",
      entityType: "custom_field",
      entityId: existing.id,
      changes: { entityType: existing.entityType, key: existing.key },
    });
  });
}
