"use client";

import { Field, FormError, SubmitButton, errorProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

import { createWorkspaceAction } from "../(auth)/actions";

export function WorkspaceForm({ onDone }: { onDone?: () => void }) {
  const { onSubmit, pending, formError, errorFor } = useActionForm(createWorkspaceAction, {
    onSuccess: () => onDone?.(),
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Workspace name" htmlFor="workspace-name" error={errorFor("name")}>
        <Input
          id="workspace-name"
          name="name"
          required
          placeholder="e.g. Northfield Sales"
          {...errorProps("workspace-name", errorFor("name"))}
        />
      </Field>
      <SubmitButton pending={pending}>Create workspace</SubmitButton>
    </form>
  );
}
