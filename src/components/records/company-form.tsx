"use client";

import { useRouter } from "next/navigation";

import { createCompanyAction, updateCompanyAction } from "@/app/(app)/companies/actions";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPANY_SIZE_LABELS } from "@/lib/format";
import { useActionForm } from "@/lib/use-action-form";

import { CustomFieldInputs, type FieldDefinitionView } from "./custom-fields";
import { TagPicker } from "./tag-picker";

export interface CompanyFormValues {
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  address: string | null;
  ownerId: string | null;
  tagIds: string[];
  customFields: Record<string, unknown>;
}

export function CompanyForm({
  companyId,
  values,
  members,
  tags,
  fields,
}: {
  companyId?: string;
  values?: CompanyFormValues;
  members: Array<{ id: string; label: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  fields: FieldDefinitionView[];
}) {
  const router = useRouter();
  const action = companyId ? updateCompanyAction.bind(null, companyId) : createCompanyAction;
  const { onSubmit, pending, formError, errorFor } = useActionForm(action, {
    successMessage: companyId ? "Company saved" : "Company created",
    onSuccess: (data) => router.push(`/companies/${data.id}`),
  });
  const text = (id: keyof CompanyFormValues, label: string, props = {}) => (
    <Field label={label} htmlFor={id} error={errorFor(id)}>
      <Input
        id={id}
        name={id}
        defaultValue={(values?.[id] as string | null | undefined) ?? ""}
        {...errorProps(id, errorFor(id))}
        {...props}
      />
    </Field>
  );

  return (
    <form method="post" onSubmit={onSubmit} className="grid max-w-3xl gap-6" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor="name"
          error={errorFor("name")}
          required
          className="sm:col-span-2"
        >
          <Input
            id="name"
            name="name"
            defaultValue={values?.name}
            autoFocus={!companyId}
            {...errorProps("name", errorFor("name"))}
          />
        </Field>
        {text("domain", "Website domain", { placeholder: "example.com" })}
        {text("industry", "Industry")}
        <Field label="Size" htmlFor="size" error={errorFor("size")}>
          <NativeSelect id="size" name="size" defaultValue={values?.size ?? ""}>
            <option value="">Unknown</option>
            {Object.entries(COMPANY_SIZE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label} employees
              </option>
            ))}
          </NativeSelect>
        </Field>
        {text("phone", "Phone", { type: "tel" })}
        {text("address", "Address")}
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
      </div>
      <TagPicker tags={tags} selected={values?.tagIds ?? []} error={errorFor("tagIds")} />
      <CustomFieldInputs
        definitions={fields}
        values={values?.customFields ?? {}}
        errorFor={errorFor}
      />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>
          {companyId ? "Save changes" : "Create company"}
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
