import type { Metadata } from "next";

import { requirePageContext } from "@/server/next/request";
import { listFieldDefinitions } from "@/server/services/custom-fields";

import { FieldEditor } from "./field-editor";

export const metadata: Metadata = { title: "Custom fields" };

export default async function FieldsSettingsPage() {
  const { ctx } = await requirePageContext();
  const definitions = await listFieldDefinitions(ctx);
  return (
    <FieldEditor
      definitions={definitions.map(({ id, entityType, key, label, type, options, required }) => ({
        id,
        entityType,
        key,
        label,
        type,
        options,
        required,
      }))}
    />
  );
}
