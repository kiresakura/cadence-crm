"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import { useRef } from "react";

import { NativeSelect } from "@/components/form";
import { Input } from "@/components/ui/input";

export interface FilterSelect {
  name: string;
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * GET form for list filters. Selects apply immediately; the search box applies on Enter.
 * Uses next/form so navigation stays client-side and the URL remains shareable.
 */
export function ListFilters({
  action,
  query,
  selects,
  searchPlaceholder = "Search…",
}: {
  action: string;
  query?: string;
  selects: FilterSelect[];
  searchPlaceholder?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Form
      ref={formRef}
      action={action}
      className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center"
      role="search"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={searchPlaceholder}
          aria-label="Search"
          className="pl-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {selects.map((select) => (
          <NativeSelect
            key={select.name}
            name={select.name}
            aria-label={select.label}
            defaultValue={select.value ?? ""}
            className="sm:w-44"
            onChange={() => formRef.current?.requestSubmit()}
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        ))}
      </div>
    </Form>
  );
}
