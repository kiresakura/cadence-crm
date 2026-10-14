"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/next/action";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  updateFieldDefinition,
} from "@/server/services/custom-fields";
import { addMember, changeMemberRole, removeMember } from "@/server/services/members";
import {
  addStage,
  createPipeline,
  deletePipeline,
  deleteStage,
  renamePipeline,
  shiftStage,
  updateStage,
} from "@/server/services/pipelines";
import { createTag, deleteTag, updateTag } from "@/server/services/tags";
import { renameWorkspace } from "@/server/services/workspaces";
import { formToObject } from "@/server/validation/common";

function done<T>(result: T) {
  revalidatePath("/", "layout");
  return result;
}

const form = (formData: FormData) => formToObject(formData);

export async function createPipelineAction(formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({ id: (await createPipeline(ctx, form(formData))).id })),
  );
}

export async function renamePipelineAction(id: string, formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({
      id: (await renamePipeline(ctx, id, form(formData))).id,
    })),
  );
}

export async function deletePipelineAction(id: string) {
  return done(await runAction(({ ctx }) => deletePipeline(ctx, id)));
}

export async function addStageAction(pipelineId: string, formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({
      id: (await addStage(ctx, pipelineId, form(formData))).id,
    })),
  );
}

export async function updateStageAction(id: string, formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({ id: (await updateStage(ctx, id, form(formData))).id })),
  );
}

export async function deleteStageAction(id: string) {
  return done(await runAction(({ ctx }) => deleteStage(ctx, id)));
}

export async function shiftStageAction(id: string, direction: "up" | "down") {
  return done(await runAction(({ ctx }) => shiftStage(ctx, id, direction)));
}

export async function createTagAction(formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({ id: (await createTag(ctx, form(formData))).id })),
  );
}

export async function updateTagAction(id: string, formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({ id: (await updateTag(ctx, id, form(formData))).id })),
  );
}

export async function deleteTagAction(id: string) {
  return done(await runAction(({ ctx }) => deleteTag(ctx, id)));
}

export async function createFieldAction(formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({
      id: (await createFieldDefinition(ctx, form(formData))).id,
    })),
  );
}

export async function updateFieldAction(id: string, formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({
      id: (await updateFieldDefinition(ctx, id, form(formData))).id,
    })),
  );
}

export async function deleteFieldAction(id: string) {
  return done(await runAction(({ ctx }) => deleteFieldDefinition(ctx, id)));
}

export async function addMemberAction(formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => {
      const { membership, temporaryPassword } = await addMember(ctx, form(formData));
      return { id: membership.id, email: membership.user.email, temporaryPassword };
    }),
  );
}

export async function changeRoleAction(membershipId: string, role: string) {
  return done(
    await runAction(async ({ ctx }) => ({
      id: (await changeMemberRole(ctx, membershipId, { role })).id,
    })),
  );
}

export async function removeMemberAction(membershipId: string) {
  return done(await runAction(({ ctx }) => removeMember(ctx, membershipId)));
}

export async function renameWorkspaceAction(formData: FormData) {
  return done(
    await runAction(async ({ ctx }) => ({ id: (await renameWorkspace(ctx, form(formData))).id })),
  );
}
