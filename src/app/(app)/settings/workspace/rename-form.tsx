"use client";

import { useRouter } from "next/navigation";

import { Field, FormError, SubmitButton, errorProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

import { renameWorkspaceAction } from "../actions";

export function RenameWorkspaceForm({ name }: { name: string }) {
  const router = useRouter();
  const { onSubmit, pending, formError, errorFor } = useActionForm(renameWorkspaceAction, {
    successMessage: "Workspace renamed",
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3" noValidate>
      <FormError message={formError} />
      <Field label="Name" htmlFor="workspace-rename" error={errorFor("name")}>
        <Input
          id="workspace-rename"
          name="name"
          defaultValue={name}
          {...errorProps("workspace-rename", errorFor("name"))}
        />
      </Field>
      <div>
        <SubmitButton pending={pending}>Save</SubmitButton>
      </div>
    </form>
  );
}
