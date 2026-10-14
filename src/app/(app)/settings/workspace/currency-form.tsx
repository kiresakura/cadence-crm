"use client";

import { useRouter } from "next/navigation";

import { Field, FormError, NativeSelect, SubmitButton } from "@/components/form";
import { useActionForm } from "@/lib/use-action-form";

import { updateWorkspaceCurrencyAction } from "../actions";

interface CurrencyOption {
  code: string;
  name: string;
}

/** Options come from the server so the list and names match its Intl data exactly. */
export function WorkspaceCurrencyForm({
  currency,
  common,
  others,
}: {
  currency: string;
  common: CurrencyOption[];
  others: CurrencyOption[];
}) {
  const router = useRouter();
  const { onSubmit, pending, formError, errorFor } = useActionForm(updateWorkspaceCurrencyAction, {
    successMessage: "Reporting currency saved",
    onSuccess: () => router.refresh(),
  });
  const option = ({ code, name }: CurrencyOption) => (
    <option key={code} value={code}>
      {code} — {name}
    </option>
  );
  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3" noValidate>
      <FormError message={formError} />
      <Field
        label="Reporting currency"
        htmlFor="workspace-currency"
        error={errorFor("currency")}
        hint="Used by the dashboard, board totals and new deals. Amounts are not converted: deals in other currencies are left out of totals."
      >
        <NativeSelect id="workspace-currency" name="currency" defaultValue={currency}>
          <optgroup label="Common">{common.map(option)}</optgroup>
          <optgroup label="All currencies">{others.map(option)}</optgroup>
        </NativeSelect>
      </Field>
      <div>
        <SubmitButton pending={pending}>Save currency</SubmitButton>
      </div>
    </form>
  );
}
