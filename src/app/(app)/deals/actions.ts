"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/next/action";
import { closeDeal, createDeal, deleteDeal, moveDeal, updateDeal } from "@/server/services/deals";
import { formToObject } from "@/server/validation/common";

function revalidateDeals() {
  revalidatePath("/deals", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/contacts", "layout");
  revalidatePath("/companies", "layout");
}

export async function createDealAction(formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const deal = await createDeal(ctx, formToObject(formData));
    return { id: deal.id };
  });
  if (result.ok) revalidateDeals();
  return result;
}

export async function updateDealAction(id: string, formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const deal = await updateDeal(ctx, id, formToObject(formData));
    return { id: deal.id };
  });
  if (result.ok) revalidateDeals();
  return result;
}

/** Kanban drag-and-drop: the server re-validates the move and the close rules. */
export async function moveDealAction(id: string, stageId: string, lostReason?: string | null) {
  const result = await runAction(async ({ ctx }) => {
    const deal = await moveDeal(ctx, id, { stageId, lostReason });
    return { id: deal.id, stageId: deal.stageId };
  });
  if (result.ok) revalidateDeals();
  return result;
}

export async function closeDealAction(id: string, outcome: "WON" | "LOST", lostReason?: string) {
  const result = await runAction(async ({ ctx }) => {
    const deal = await closeDeal(ctx, id, outcome, lostReason);
    return { id: deal.id };
  });
  if (result.ok) revalidateDeals();
  return result;
}

export async function deleteDealAction(id: string) {
  const result = await runAction(async ({ ctx }) => deleteDeal(ctx, id));
  if (result.ok) revalidateDeals();
  return result;
}
