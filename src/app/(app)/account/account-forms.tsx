"use client";

import { useRouter } from "next/navigation";

import { changePasswordAction, updateProfileAction } from "@/app/(auth)/actions";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

export function ProfileForm({
  name,
  timezone,
  timeZones,
}: {
  name: string;
  timezone: string;
  timeZones: string[];
}) {
  const router = useRouter();
  const { onSubmit, pending, formError, errorFor } = useActionForm(updateProfileAction, {
    successMessage: "Profile saved",
    onSuccess: () => router.refresh(),
  });
  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Name" htmlFor="profile-name" error={errorFor("name")}>
        <Input
          id="profile-name"
          name="name"
          defaultValue={name}
          autoComplete="name"
          {...errorProps("profile-name", errorFor("name"))}
        />
      </Field>
      <Field
        label="Time zone"
        htmlFor="profile-timezone"
        error={errorFor("timezone")}
        hint="Used for due dates, “today” and the dashboard."
      >
        <NativeSelect id="profile-timezone" name="timezone" defaultValue={timezone}>
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div>
        <SubmitButton pending={pending}>Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const { onSubmit, pending, formError, errorFor } = useActionForm(changePasswordAction, {
    successMessage: "Password changed. Other sessions were signed out.",
    onSuccess: (_data, form) => form.reset(),
  });
  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <Field
        label="Current password"
        htmlFor="current-password"
        error={errorFor("currentPassword")}
      >
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          {...errorProps("current-password", errorFor("currentPassword"))}
        />
      </Field>
      <Field
        label="New password"
        htmlFor="new-password"
        error={errorFor("newPassword")}
        hint="At least 10 characters."
      >
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          {...errorProps("new-password", errorFor("newPassword"))}
        />
      </Field>
      <div>
        <SubmitButton pending={pending}>Change password</SubmitButton>
      </div>
    </form>
  );
}
