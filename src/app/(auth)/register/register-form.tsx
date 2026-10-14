"use client";

import { useEffect, useRef } from "react";

import { Field, FormError, SubmitButton, errorProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

import { registerAction } from "../actions";

export function RegisterForm() {
  const { onSubmit, pending, formError, errorFor } = useActionForm(registerAction);
  const timezoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <input ref={timezoneRef} type="hidden" name="timezone" />
      <Field label="Your name" htmlFor="name" error={errorFor("name")}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          {...errorProps("name", errorFor("name"))}
        />
      </Field>
      <Field label="Work email" htmlFor="email" error={errorFor("email")}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          {...errorProps("email", errorFor("email"))}
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
      <Field label="Workspace name" htmlFor="workspaceName" error={errorFor("workspaceName")}>
        <Input
          id="workspaceName"
          name="workspaceName"
          placeholder="e.g. Northfield Sales"
          required
          {...errorProps("workspaceName", errorFor("workspaceName"))}
        />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Create workspace
      </SubmitButton>
    </form>
  );
}
