"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/next/action";
import { createCompany, deleteCompany, updateCompany } from "@/server/services/companies";
import { formToObject } from "@/server/validation/common";

function revalidateCompanies() {
  revalidatePath("/companies", "layout");
  revalidatePath("/contacts", "layout");
  revalidatePath("/deals", "layout");
}

export async function createCompanyAction(formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const company = await createCompany(ctx, formToObject(formData, { arrays: ["tagIds"] }));
    return { id: company.id };
  });
  if (result.ok) revalidateCompanies();
  return result;
}

export async function updateCompanyAction(id: string, formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const company = await updateCompany(ctx, id, formToObject(formData, { arrays: ["tagIds"] }));
    return { id: company.id };
  });
  if (result.ok) revalidateCompanies();
  return result;
}

export async function deleteCompanyAction(id: string) {
  const result = await runAction(async ({ ctx }) => deleteCompany(ctx, id));
  if (result.ok) revalidateCompanies();
  return result;
}
