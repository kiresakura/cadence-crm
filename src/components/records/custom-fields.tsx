import type { CustomFieldType } from "@/generated/prisma/enums";
import { Field, NativeSelect, errorProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { formatCalendarDate } from "@/lib/format";

export interface FieldDefinitionView {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
}

/** Inputs for a record's custom fields; values are submitted as `cf.<key>`. */
export function CustomFieldInputs({
  definitions,
  values,
  errorFor,
}: {
  definitions: FieldDefinitionView[];
  values: Record<string, unknown>;
  errorFor: (name: string) => string | undefined;
}) {
  if (definitions.length === 0) return null;
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">Custom fields</legend>
      {definitions.map((definition) => {
        const id = `cf-${definition.key}`;
        const name = `cf.${definition.key}`;
        const error = errorFor(`customFields.${definition.key}`);
        // Own properties only: a key such as "constructor" must not read Object.prototype.
        const value = Object.hasOwn(values, definition.key) ? values[definition.key] : undefined;
        // A stored choice whose option was removed later stays selectable, so saving the form
        // sends it back unchanged instead of clearing it.
        const retired =
          definition.type === "SELECT" &&
          typeof value === "string" &&
          value !== "" &&
          !definition.options.includes(value)
            ? value
            : null;
        const common = { id, name, ...errorProps(id, error) };
        return (
          <Field
            key={definition.id}
            label={definition.label}
            htmlFor={id}
            error={error}
            required={definition.required}
          >
            {definition.type === "SELECT" ? (
              <NativeSelect {...common} defaultValue={typeof value === "string" ? value : ""}>
                <option value="">—</option>
                {retired ? <option value={retired}>{retired} (no longer an option)</option> : null}
                {definition.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            ) : definition.type === "BOOLEAN" ? (
              <NativeSelect
                {...common}
                defaultValue={value === true ? "true" : value === false ? "false" : ""}
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </NativeSelect>
            ) : (
              <Input
                {...common}
                type={
                  definition.type === "NUMBER"
                    ? "number"
                    : definition.type === "DATE"
                      ? "date"
                      : "text"
                }
                step={definition.type === "NUMBER" ? "any" : undefined}
                defaultValue={value === undefined || value === null ? "" : String(value)}
              />
            )}
          </Field>
        );
      })}
    </fieldset>
  );
}

export function formatCustomFieldValue(definition: FieldDefinitionView, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (definition.type === "BOOLEAN") return value ? "Yes" : "No";
  if (definition.type === "DATE" && typeof value === "string") return formatCalendarDate(value);
  if (definition.type === "NUMBER" && typeof value === "number")
    return value.toLocaleString("en-US");
  return String(value);
}

export function customFieldItems(
  definitions: FieldDefinitionView[],
  values: Record<string, unknown>,
) {
  return definitions.map((definition) => ({
    label: definition.label,
    value: formatCustomFieldValue(definition, values[definition.key]),
  }));
}
