"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/next/action";
import { deleteActivity, logActivity } from "@/server/services/activities";
import { createTask, deleteTask, setTaskCompleted, updateTask } from "@/server/services/tasks";
import { formToObject } from "@/server/validation/common";

// Actions shared by contact, company, deal and task pages.

function revalidateRecords() {
  for (const path of ["/contacts", "/companies", "/deals", "/tasks", "/dashboard"]) {
    revalidatePath(path, "layout");
  }
}

export async function logActivityAction(formData: FormData) {
  const result = await runAction(async ({ ctx, user }) => {
    const activity = await logActivity(ctx, formToObject(formData), { timeZone: user.timezone });
    return { id: activity.id };
  });
  if (result.ok) revalidateRecords();
  return result;
}

export async function deleteActivityAction(id: string) {
  const result = await runAction(async ({ ctx }) => deleteActivity(ctx, id));
  if (result.ok) revalidateRecords();
  return result;
}

export async function saveTaskAction(formData: FormData) {
  const result = await runAction(async ({ ctx, user }) => {
    const input = formToObject(formData);
    const id = typeof input.id === "string" && input.id ? input.id : null;
    const task = id
      ? await updateTask(ctx, id, input, user.timezone)
      : await createTask(ctx, input, user.timezone);
    return { id: task.id };
  });
  if (result.ok) revalidateRecords();
  return result;
}

export async function toggleTaskAction(id: string, completed: boolean) {
  const result = await runAction(async ({ ctx }) => {
    await setTaskCompleted(ctx, id, completed);
    return null;
  });
  if (result.ok) revalidateRecords();
  return result;
}

export async function deleteTaskAction(id: string) {
  const result = await runAction(async ({ ctx }) => deleteTask(ctx, id));
  if (result.ok) revalidateRecords();
  return result;
}
