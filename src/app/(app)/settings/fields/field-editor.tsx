"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomFieldEntity, CustomFieldType } from "@/generated/prisma/enums";
import { useActionForm } from "@/lib/use-action-form";

import { createFieldAction, deleteFieldAction, updateFieldAction } from "../actions";

interface Definition {
  id: string;
  entityType: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
}

const ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  CONTACT: "Contacts",
  COMPANY: "Companies",
  DEAL: "Deals",
};

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Select",
  BOOLEAN: "Yes / no",
};

function DefinitionRow({ definition }: { definition: Definition }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useActionForm(updateFieldAction.bind(null, definition.id), {
    successMessage: "Field saved",
    onSuccess: () => router.refresh(),
  });
  return (
    <li className="py-3">
      <form
        onSubmit={form.onSubmit}
        className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start"
        noValidate
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Input name="label" defaultValue={definition.label} aria-label="Label" />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <code>{definition.key}</code>{" "}
              <Badge variant="secondary">{TYPE_LABELS[definition.type]}</Badge>
            </p>
          </div>
          <div className="grid gap-2">
            {definition.type === "SELECT" ? (
              <Textarea
                name="options"
                rows={2}
                defaultValue={definition.options.join("\n")}
                aria-label="Options, one per line"
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="required"
                defaultChecked={definition.required}
                className="accent-primary"
              />
              Required
            </label>
          </div>
        </div>
        <div className="flex gap-1">
          <SubmitButton pending={form.pending} variant="outline" size="sm">
            Save
          </SubmitButton>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete field ${definition.label}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteFieldAction(definition.id);
                if (result.ok) {
                  toast.success("Field deleted");
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            <Trash2 />
          </Button>
        </div>
      </form>
      <FormError message={form.formError} />
    </li>
  );
}

export function FieldEditor({ definitions }: { definitions: Definition[] }) {
  const router = useRouter();
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const add = useActionForm(createFieldAction, {
    successMessage: "Field created",
    onSuccess: (_data, form) => {
      form.reset();
      setType("TEXT");
      router.refresh();
    },
  });

  return (
    <div className="grid gap-6">
      {(Object.keys(ENTITY_LABELS) as CustomFieldEntity[]).map((entity) => {
        const items = definitions.filter((definition) => definition.entityType === entity);
        return (
          <section key={entity} className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{ENTITY_LABELS[entity]}</h2>
            </div>
            <div className="px-4">
              {items.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No custom fields yet.</p>
              ) : (
                <ul className="divide-y">
                  {items.map((definition) => (
                    <DefinitionRow key={definition.id} definition={definition} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      <section className="rounded-xl border border-dashed p-4">
        <h2 className="text-sm font-semibold">Add a custom field</h2>
        <p className="text-xs text-muted-foreground">
          Values are validated against the field type whenever a record is saved.
        </p>
        <form onSubmit={add.onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2" noValidate>
          <FormError message={add.formError} />
          <Field label="Applies to" htmlFor="field-entity">
            <NativeSelect id="field-entity" name="entityType" defaultValue="CONTACT">
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Label" htmlFor="field-label" error={add.errorFor("label")}>
            <Input
              id="field-label"
              name="label"
              {...errorProps("field-label", add.errorFor("label"))}
            />
          </Field>
          <Field label="Type" htmlFor="field-type">
            <NativeSelect
              id="field-type"
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value as CustomFieldType)}
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {type === "SELECT" ? (
            <Field
              label="Options (one per line)"
              htmlFor="field-options"
              error={add.errorFor("options")}
            >
              <Textarea id="field-options" name="options" rows={3} />
            </Field>
          ) : (
            <div />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="required" className="accent-primary" /> Required
          </label>
          <div className="sm:text-right">
            <SubmitButton pending={add.pending}>
              <Plus /> Add field
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
