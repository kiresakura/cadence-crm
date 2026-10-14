"use client";

import { KeyRound, UserPlus, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/badges";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Role } from "@/generated/prisma/enums";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/format";
import { useActionForm } from "@/lib/use-action-form";

import { addMemberAction, changeRoleAction, removeMemberAction } from "../actions";

interface MemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export function MemberManager({
  members,
  actorRole,
  currentUserId,
}: {
  members: MemberView[];
  actorRole: Role;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [invite, setInvite] = useState<{ email: string; password: string } | null>(null);
  const assignable: Role[] =
    actorRole === "OWNER" ? ["OWNER", "ADMIN", "MEMBER", "VIEWER"] : ["ADMIN", "MEMBER", "VIEWER"];
  const add = useActionForm(addMemberAction, {
    successMessage: "Member added",
    onSuccess: (data, form) => {
      form.reset();
      if (data.temporaryPassword)
        setInvite({ email: data.email, password: data.temporaryPassword });
      router.refresh();
    },
  });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Members ({members.length})</h2>
        </div>
        <ul className="divide-y">
          {members.map((member) => {
            const locked = member.role === "OWNER" && actorRole !== "OWNER";
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <UserAvatar name={member.name} className="size-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {member.name}
                    {member.userId === currentUserId ? (
                      <span className="text-muted-foreground"> (you)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <NativeSelect
                  aria-label={`Role for ${member.name}`}
                  className="w-32"
                  defaultValue={member.role}
                  disabled={pending || locked}
                  onChange={(event) =>
                    run(() => changeRoleAction(member.id, event.target.value), "Role updated")
                  }
                >
                  {(locked ? (["OWNER"] as Role[]) : assignable).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.name}`}
                  disabled={pending || locked}
                  onClick={() => run(() => removeMemberAction(member.id), "Member removed")}
                >
                  <UserX />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-dashed p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="size-4" /> Add a member
        </h2>
        <p className="text-xs text-muted-foreground">
          New people get an account with a temporary password that you share with them.
        </p>
        <form
          onSubmit={add.onSubmit}
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end"
          noValidate
        >
          <Field label="Name" htmlFor="member-name" error={add.errorFor("name")}>
            <Input
              id="member-name"
              name="name"
              {...errorProps("member-name", add.errorFor("name"))}
            />
          </Field>
          <Field label="Email" htmlFor="member-email" error={add.errorFor("email")}>
            <Input
              id="member-email"
              name="email"
              type="email"
              {...errorProps("member-email", add.errorFor("email"))}
            />
          </Field>
          <Field label="Role" htmlFor="member-role">
            <NativeSelect id="member-role" name="role" defaultValue="MEMBER">
              {assignable.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SubmitButton pending={add.pending}>Add</SubmitButton>
        </form>
        <FormError message={add.formError} />
        <dl className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {(Object.keys(ROLE_DESCRIPTIONS) as Role[]).map((role) => (
            <div key={role}>
              <dt className="inline font-medium text-foreground">{ROLE_LABELS[role]}:</dt>{" "}
              <dd className="inline">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Dialog open={invite !== null} onOpenChange={(open) => !open && setInvite(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Temporary password
            </DialogTitle>
            <DialogDescription>
              Share this with {invite?.email}. It is shown only once; they can sign in with it right
              away.
            </DialogDescription>
          </DialogHeader>
          <code
            className="rounded-lg border bg-muted px-3 py-2 text-center font-mono text-lg"
            data-testid="temporary-password"
          >
            {invite?.password}
          </code>
          <DialogFooter>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(invite?.password ?? "");
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
