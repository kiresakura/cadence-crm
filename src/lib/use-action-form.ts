"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import type { ActionResult } from "./action-result";

/**
 * Submits a form to a server action without React's automatic form reset, so the user's
 * input survives validation errors. Field errors and a form-level error are kept in state.
 */
export function useActionForm<T>(
  action: (formData: FormData) => Promise<ActionResult<T>>,
  options: {
    successMessage?: string | ((data: T) => string);
    onSuccess?: (data: T, form: HTMLFormElement) => void;
  } = {},
) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        setFieldErrors({});
        setFormError(null);
        const message =
          typeof options.successMessage === "function"
            ? options.successMessage(result.data)
            : options.successMessage;
        if (message) toast.success(message);
        options.onSuccess?.(result.data, form);
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
      }
    });
  }

  const errorFor = (name: string) => fieldErrors[name]?.[0];

  return { onSubmit, pending, fieldErrors, formError, errorFor };
}
