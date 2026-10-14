"use client";

import { useRouter } from "next/navigation";

import { createContactAction, updateContactAction } from "@/app/(app)/contacts/actions";
import { searchCompanyOptionsAction } from "@/app/(app)/record-actions";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIFECYCLE_LABELS } from "@/lib/format";
import { useActionForm } from "@/lib/use-action-form";

import { CustomFieldInputs, type FieldDefinitionView } from "./custom-fields";
import { RecordCombobox, type RecordOption } from "./record-combobox";
import { TagPicker } from "./tag-picker";

export interface ContactFormValues {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  companyId: string | null;
  ownerId: string | null;
  lifecycleStage: keyof typeof LIFECYCLE_LABELS;
  source: string | null;
  tagIds: string[];
  customFields: Record<string, unknown>;
}

export function ContactForm({
  contactId,
  values,
  company,
  members,
  tags,
  fields,
}: {
  contactId?: string;
  values?: ContactFormValues;
  /** Currently linked company, shown in the picker. */
  company: RecordOption | null;
  members: Array<{ id: string; label: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  fields: FieldDefinitionView[];
}) {
  const router = useRouter();
  const action = contactId ? updateContactAction.bind(null, contactId) : createContactAction;
  const { onSubmit, pending, formError, errorFor } = useActionForm(action, {
    successMessage: contactId ? "Contact saved" : "Contact created",
    onSuccess: (data) => router.push(`/contacts/${data.id}`),
  });
  const text = (id: string, label: string, value: string | null | undefined, props = {}) => (
    <Field label={label} htmlFor={id} error={errorFor(id)}>
      <Input
        id={id}
        name={id}
        defaultValue={value ?? ""}
        {...errorProps(id, errorFor(id))}
        {...props}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-6" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={errorFor("firstName")} required>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={values?.firstName}
            autoFocus={!contactId}
            {...errorProps("firstName", errorFor("firstName"))}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errorFor("lastName")} required>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={values?.lastName}
            {...errorProps("lastName", errorFor("lastName"))}
          />
        </Field>
        {text("email", "Email", values?.email, { type: "email" })}
        {text("phone", "Phone", values?.phone, { type: "tel" })}
        {text("jobTitle", "Job title", values?.jobTitle)}
        <Field label="Company" htmlFor="companyId" error={errorFor("companyId")}>
          <RecordCombobox
            id="companyId"
            name="companyId"
            label="Company"
            initial={company}
            search={searchCompanyOptionsAction}
            placeholder="Search companies…"
            {...(errorFor("companyId") ? { invalid: true, describedBy: "companyId-error" } : {})}
          />
        </Field>
        <Field label="Lifecycle stage" htmlFor="lifecycleStage" error={errorFor("lifecycleStage")}>
          <NativeSelect
            id="lifecycleStage"
            name="lifecycleStage"
            defaultValue={values?.lifecycleStage ?? "LEAD"}
          >
            {Object.entries(LIFECYCLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Owner" htmlFor="ownerId" error={errorFor("ownerId")}>
          <NativeSelect id="ownerId" name="ownerId" defaultValue={values?.ownerId ?? ""}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {text("source", "Source", values?.source, { placeholder: "e.g. Referral, Website" })}
      </div>
      <TagPicker tags={tags} selected={values?.tagIds ?? []} error={errorFor("tagIds")} />
      <CustomFieldInputs
        definitions={fields}
        values={values?.customFields ?? {}}
        errorFor={errorFor}
      />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>
          {contactId ? "Save changes" : "Create contact"}
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
