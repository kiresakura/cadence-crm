"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createDealAction, updateDealAction } from "@/app/(app)/deals/actions";
import { searchCompanyOptionsAction, searchContactOptionsAction } from "@/app/(app)/record-actions";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StageType } from "@/generated/prisma/enums";
import { useActionForm } from "@/lib/use-action-form";

import { CustomFieldInputs, type FieldDefinitionView } from "./custom-fields";
import { RecordCombobox, type RecordOption } from "./record-combobox";

export interface DealFormValues {
  title: string;
  amount: string;
  currency: string;
  pipelineId: string;
  stageId: string;
  companyId: string | null;
  primaryContactId: string | null;
  ownerId: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  customFields: Record<string, unknown>;
}

function comboboxErrorProps(id: string, error?: string) {
  return error ? { invalid: true, describedBy: `${id}-error` } : {};
}

export interface PipelineOption {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; type: StageType; probability: number }>;
}

export function DealForm({
  dealId,
  values,
  pipelines,
  company,
  primaryContact,
  members,
  fields,
}: {
  dealId?: string;
  values: DealFormValues;
  pipelines: PipelineOption[];
  /** Currently linked records, shown in the pickers. */
  company: RecordOption | null;
  primaryContact: RecordOption | null;
  members: Array<{ id: string; label: string }>;
  fields: FieldDefinitionView[];
}) {
  const router = useRouter();
  const [pipelineId, setPipelineId] = useState(values.pipelineId);
  const [stageId, setStageId] = useState(values.stageId);
  const pipeline = pipelines.find((candidate) => candidate.id === pipelineId) ?? pipelines[0];
  const stage = pipeline?.stages.find((candidate) => candidate.id === stageId);
  const action = dealId ? updateDealAction.bind(null, dealId) : createDealAction;
  const { onSubmit, pending, formError, errorFor } = useActionForm(action, {
    successMessage: dealId ? "Deal saved" : "Deal created",
    onSuccess: (data) => router.push(`/deals/${data.id}`),
  });

  return (
    <form method="post" onSubmit={onSubmit} className="grid max-w-3xl gap-6" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Title"
          htmlFor="title"
          error={errorFor("title")}
          required
          className="sm:col-span-2"
        >
          <Input
            id="title"
            name="title"
            defaultValue={values.title}
            autoFocus={!dealId}
            {...errorProps("title", errorFor("title"))}
          />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label="Amount" htmlFor="amount" error={errorFor("amount")} required>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={values.amount}
              {...errorProps("amount", errorFor("amount"))}
            />
          </Field>
          <Field label="Currency" htmlFor="currency" error={errorFor("currency")}>
            <Input
              id="currency"
              name="currency"
              maxLength={3}
              defaultValue={values.currency}
              className="uppercase"
              {...errorProps("currency", errorFor("currency"))}
            />
          </Field>
        </div>
        <Field
          label="Expected close"
          htmlFor="expectedCloseDate"
          error={errorFor("expectedCloseDate")}
        >
          <Input
            id="expectedCloseDate"
            name="expectedCloseDate"
            type="date"
            defaultValue={values.expectedCloseDate ?? ""}
          />
        </Field>
        <Field label="Pipeline" htmlFor="pipelineId" error={errorFor("pipelineId")}>
          <NativeSelect
            id="pipelineId"
            name="pipelineId"
            value={pipelineId}
            onChange={(event) => {
              const next = pipelines.find((candidate) => candidate.id === event.target.value);
              setPipelineId(event.target.value);
              setStageId(next?.stages[0]?.id ?? "");
            }}
          >
            {pipelines.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Stage" htmlFor="stageId" error={errorFor("stageId")}>
          <NativeSelect
            id="stageId"
            name="stageId"
            value={stageId}
            onChange={(event) => setStageId(event.target.value)}
            {...errorProps("stageId", errorFor("stageId"))}
          >
            {pipeline?.stages.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.type === "OPEN" ? ` (${option.probability}%)` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {stage?.type === "LOST" ? (
          <Field
            label="Lost reason"
            htmlFor="lostReason"
            error={errorFor("lostReason")}
            required
            className="sm:col-span-2"
          >
            <Textarea
              id="lostReason"
              name="lostReason"
              rows={2}
              defaultValue={values.lostReason ?? ""}
              {...errorProps("lostReason", errorFor("lostReason"))}
            />
          </Field>
        ) : null}
        <Field label="Company" htmlFor="companyId" error={errorFor("companyId")}>
          <RecordCombobox
            id="companyId"
            name="companyId"
            label="Company"
            initial={company}
            search={searchCompanyOptionsAction}
            placeholder="Search companies…"
            {...comboboxErrorProps("companyId", errorFor("companyId"))}
          />
        </Field>
        <Field
          label="Primary contact"
          htmlFor="primaryContactId"
          error={errorFor("primaryContactId")}
        >
          <RecordCombobox
            id="primaryContactId"
            name="primaryContactId"
            label="Primary contact"
            initial={primaryContact}
            search={searchContactOptionsAction}
            placeholder="Search contacts…"
            {...comboboxErrorProps("primaryContactId", errorFor("primaryContactId"))}
          />
        </Field>
        <Field label="Owner" htmlFor="ownerId" error={errorFor("ownerId")}>
          <NativeSelect id="ownerId" name="ownerId" defaultValue={values.ownerId ?? ""}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <CustomFieldInputs definitions={fields} values={values.customFields} errorFor={errorFor} />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>{dealId ? "Save changes" : "Create deal"}</SubmitButton>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
