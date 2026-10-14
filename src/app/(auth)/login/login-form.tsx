"use client";

import { useRef } from "react";

import { Field, FormError, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

import { loginAction } from "../actions";

export function LoginForm({
  next,
  demo,
}: {
  next?: string;
  demo: { password: string; accounts: Array<{ label: string; email: string }> } | null;
}) {
  const { onSubmit, pending, formError, errorFor } = useActionForm(loginAction);
  const formRef = useRef<HTMLFormElement>(null);

  function signInAsDemo(email: string) {
    const form = formRef.current;
    if (!form || !demo) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = email;
    (form.elements.namedItem("password") as HTMLInputElement).value = demo.password;
    form.requestSubmit();
  }

  return (
    <div className="grid gap-6">
      <form ref={formRef} method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormError message={formError} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email" htmlFor="email" error={errorFor("email")}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            {...errorProps("email", errorFor("email"))}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errorFor("password")}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            {...errorProps("password", errorFor("password"))}
          />
        </Field>
        <SubmitButton pending={pending} className="w-full">
          Sign in
        </SubmitButton>
      </form>

      {demo ? (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Demo workspace — sign in as (password <code>{demo.password}</code>):
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {demo.accounts.map((account) => (
              <Button
                key={account.email}
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => signInAsDemo(account.email)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
