"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteActivityAction, logActivityAction } from "@/app/(app)/record-actions";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionForm } from "@/lib/use-action-form";

export function ActivityForm({
  link,
}: {
  link: { contactId?: string; companyId?: string; dealId?: string };
}) {
  const router = useRouter();
  const { onSubmit, pending, formError, errorFor } = useActionForm(logActivityAction, {
    successMessage: "Activity logged",
    onSuccess: (_data, form) => {
      form.reset();
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <FormError message={formError} />
      {Object.entries(link).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Type" htmlFor="activity-type">
          <NativeSelect id="activity-type" name="type" defaultValue="NOTE">
            <option value="NOTE">Note</option>
            <option value="CALL">Call</option>
            <option value="EMAIL">Email</option>
            <option value="MEETING">Meeting</option>
          </NativeSelect>
        </Field>
        <Field label="Subject" htmlFor="activity-subject" error={errorFor("subject")}>
          <Input
            id="activity-subject"
            name="subject"
            placeholder="What happened?"
            {...errorProps("activity-subject", errorFor("subject"))}
          />
        </Field>
      </div>
      <Field label="Details" htmlFor="activity-body" error={errorFor("body")}>
        <Textarea id="activity-body" name="body" rows={3} placeholder="Optional notes" />
      </Field>
      <div className="flex items-end justify-between gap-3">
        <Field label="When" htmlFor="activity-occurred" error={errorFor("occurredAt")}>
          <Input id="activity-occurred" name="occurredAt" type="datetime-local" className="w-56" />
        </Field>
        <SubmitButton pending={pending}>Log activity</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteActivityButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete activity"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteActivityAction(id);
          if (result.ok) {
            toast.success("Activity deleted");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
