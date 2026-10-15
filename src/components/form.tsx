import { CircleAlert, Loader2 } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + help text + error message, wired up with aria attributes. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function errorProps(id: string, error?: string) {
  return error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-red-700 dark:text-red-200"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  variant,
  size,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** Native select styled like the other inputs: accessible, keyboard friendly, FormData-ready. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
