"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/next/action";
import { createContact, deleteContact, updateContact } from "@/server/services/contacts";
import { mergeContacts } from "@/server/services/duplicates";
import { importContacts, previewContactImport, readImportUpload } from "@/server/services/imports";
import { formToObject } from "@/server/validation/common";

function revalidateContacts() {
  revalidatePath("/contacts", "layout");
  revalidatePath("/companies", "layout");
  revalidatePath("/dashboard");
}

export async function createContactAction(formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const contact = await createContact(ctx, formToObject(formData, { arrays: ["tagIds"] }));
    return { id: contact.id };
  });
  if (result.ok) revalidateContacts();
  return result;
}

export async function updateContactAction(id: string, formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const contact = await updateContact(ctx, id, formToObject(formData, { arrays: ["tagIds"] }));
    return { id: contact.id };
  });
  if (result.ok) revalidateContacts();
  return result;
}

export async function deleteContactAction(id: string) {
  const result = await runAction(async ({ ctx }) => deleteContact(ctx, id));
  if (result.ok) revalidateContacts();
  return result;
}

export async function mergeContactsAction(keepId: string, mergeId: string) {
  const result = await runAction(async ({ ctx }) => {
    const contact = await mergeContacts(ctx, keepId, mergeId);
    return { id: contact.id };
  });
  if (result.ok) revalidateContacts();
  return result;
}

/** `formData` holds the CSV `file` and, once columns were adjusted, a JSON `mapping`. */
export async function previewImportAction(formData: FormData) {
  return runAction(async ({ ctx }) => {
    const { text, mapping } = await readImportUpload(formData);
    return previewContactImport(ctx, text, mapping);
  });
}

export async function importContactsAction(formData: FormData) {
  const result = await runAction(async ({ ctx }) => {
    const { text, mapping } = await readImportUpload(formData);
    return importContacts(ctx, text, mapping);
  });
  if (result.ok) revalidateContacts();
  return result;
}
