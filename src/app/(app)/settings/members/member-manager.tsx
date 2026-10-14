"use client";

import { Link2, MailPlus, RefreshCw, UserX } from "lucide-react";
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
import { ROLE_DESCRIPTIONS, ROLE_LABELS, formatDate } from "@/lib/format";
import { useActionForm } from "@/lib/use-action-form";

import {
  changeRoleAction,
  createInvitationAction,
  regenerateInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
} from "../actions";

interface MemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
}

interface InvitationView {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  expiresAt: Date;
}

interface InviteLink {
  email: string;
  url: string;
  expiresAt: Date;
}

export function MemberManager({
  members,
  invitations,
  actorRole,
  currentUserId,
  timeZone,
}: {
  members: MemberView[];
  invitations: InvitationView[];
  actorRole: Role;
  currentUserId: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<InviteLink | null>(null);
  const [removing, setRemoving] = useState<MemberView | null>(null);
  const [handoverTo, setHandoverTo] = useState(currentUserId);
  const assignable: Role[] =
    actorRole === "OWNER" ? ["OWNER", "ADMIN", "MEMBER", "VIEWER"] : ["ADMIN", "MEMBER", "VIEWER"];
  const invite = useActionForm(createInvitationAction, {
    successMessage: "Invitation link created",
    onSuccess: (data, form) => {
      const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
      form.reset();
      setLink({ email, url: data.inviteUrl, expiresAt: data.expiresAt });
      router.refresh();
    },
  });

  function regenerate(invitation: InvitationView) {
    startTransition(async () => {
      const result = await regenerateInvitationAction(invitation.id);
      if (result.ok) {
        setLink({
          email: invitation.email,
          url: result.data.inviteUrl,
          expiresAt: result.data.expiresAt,
        });
      } else {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

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
                  onClick={() => {
                    setRemoving(member);
                    setHandoverTo(
                      member.userId === currentUserId
                        ? (members.find((other) => other.userId !== member.userId)?.userId ?? "")
                        : currentUserId,
                    );
                  }}
                >
                  <UserX />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {invitations.length > 0 ? (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Pending invitations ({invitations.length})</h2>
          </div>
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[invitation.role]} · invited by {invitation.invitedBy} · expires{" "}
                    {formatDate(invitation.expiresAt, timeZone)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={`Regenerate link for ${invitation.email}`}
                  onClick={() => regenerate(invitation)}
                >
                  <RefreshCw /> Regenerate link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={`Revoke invitation for ${invitation.email}`}
                  onClick={() =>
                    run(() => revokeInvitationAction(invitation.id), "Invitation revoked")
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-dashed p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MailPlus className="size-4" /> Invite a member
        </h2>
        <p className="text-xs text-muted-foreground">
          Creates a one-time link, valid for 7 days, that you send yourself. Only someone signed in
          with this email address can accept it.
        </p>
        <form
          onSubmit={invite.onSubmit}
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
          noValidate
        >
          <Field label="Email" htmlFor="invite-email" error={invite.errorFor("email")}>
            <Input
              id="invite-email"
              name="email"
              type="email"
              maxLength={254}
              {...errorProps("invite-email", invite.errorFor("email"))}
            />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <NativeSelect id="invite-role" name="role" defaultValue="MEMBER">
              {assignable.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SubmitButton pending={invite.pending}>Create invite link</SubmitButton>
        </form>
        <FormError message={invite.formError} />
        <dl className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {(Object.keys(ROLE_DESCRIPTIONS) as Role[]).map((role) => (
            <div key={role}>
              <dt className="inline font-medium text-foreground">{ROLE_LABELS[role]}:</dt>{" "}
              <dd className="inline">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They lose access right away. Their contacts, companies, deals and open tasks in this
              workspace move to the member you choose.
            </DialogDescription>
          </DialogHeader>
          <Field label="Hand over their work to" htmlFor="handover-to">
            <NativeSelect
              id="handover-to"
              value={handoverTo}
              onChange={(event) => setHandoverTo(event.target.value)}
            >
              {members
                .filter((member) => member.userId !== removing?.userId)
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                    {member.userId === currentUserId ? " (you)" : ""}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !handoverTo}
              onClick={() => {
                const target = removing;
                if (!target) return;
                setRemoving(null);
                run(() => removeMemberAction(target.id, handoverTo), "Member removed");
              }}
            >
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-4" /> Invitation link
            </DialogTitle>
            <DialogDescription>
              Send this link to {link?.email}. It is shown only once and works until{" "}
              {link ? formatDate(link.expiresAt, timeZone) : ""}.
            </DialogDescription>
          </DialogHeader>
          <Input
            readOnly
            aria-label="Invitation link"
            value={link?.url ?? ""}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-xs"
            data-testid="invite-link"
          />
          <DialogFooter>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(link?.url ?? "");
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
