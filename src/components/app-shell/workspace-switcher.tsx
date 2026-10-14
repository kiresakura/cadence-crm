"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createWorkspaceAction, switchWorkspaceAction } from "@/app/(auth)/actions";
import { Field, FormError, SubmitButton, errorProps } from "@/components/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/format";
import { useActionForm } from "@/lib/use-action-form";
import type { Role } from "@/generated/prisma/enums";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: { id: string; name: string };
  workspaces: Array<{ id: string; name: string; role: Role }>;
}) {
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useActionForm(createWorkspaceAction, { onSuccess: () => setCreating(false) });

  function choose(id: string) {
    if (id === current.id) return;
    startTransition(async () => {
      const result = await switchWorkspaceAction(id);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
          disabled={pending}
          aria-label="Switch workspace"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
            {current.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem key={workspace.id} onSelect={() => choose(workspace.id)}>
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[workspace.role]}</span>
              {workspace.id === current.id ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus className="size-4" /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              Workspaces keep data completely separate. You will be its owner.
            </DialogDescription>
          </DialogHeader>
          <form method="post" onSubmit={form.onSubmit} className="grid gap-4" noValidate>
            <FormError message={form.formError} />
            <Field label="Name" htmlFor="new-workspace-name" error={form.errorFor("name")}>
              <Input
                id="new-workspace-name"
                name="name"
                required
                {...errorProps("new-workspace-name", form.errorFor("name"))}
              />
            </Field>
            <SubmitButton pending={form.pending}>Create workspace</SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
