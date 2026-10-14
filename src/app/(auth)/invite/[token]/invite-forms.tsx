"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Field, FormError, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { useActionForm } from "@/lib/use-action-form";

import {
  acceptInvitationAction,
  declineInvitationAction,
  registerWithInvitationAction,
} from "../../actions";

/** Sign-up for someone without an account: the email is fixed to the invited address. */
export function InviteRegisterForm({ token, email }: { token: string; email: string }) {
  const { onSubmit, pending, formError, errorFor } = useActionForm(registerWithInvitationAction);
  const timezoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <input type="hidden" name="token" value={token} />
      <input ref={timezoneRef} type="hidden" name="timezone" />
      <Field label="Email" htmlFor="invite-email" hint="Set by the invitation.">
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          readOnly
        />
      </Field>
      <Field label="Your name" htmlFor="name" error={errorFor("name")}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          {...errorProps("name", errorFor("name"))}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={errorFor("password")}
        hint="At least 10 characters."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          {...errorProps("password", errorFor("password"))}
        />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Create account and join
      </SubmitButton>
    </form>
  );
}

/** Accept or decline, for a signed-in user whose email matches the invitation. */
export function InviteDecision({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (token: string) => Promise<ActionResult>) {
    startTransition(async () => {
      // Success redirects; only failures come back here.
      const result = await action(token);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Button disabled={pending} onClick={() => run(acceptInvitationAction)}>
        Accept
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => run(declineInvitationAction)}>
        Decline
      </Button>
    </div>
  );
}
