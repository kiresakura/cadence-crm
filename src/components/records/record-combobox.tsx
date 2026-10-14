"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export interface RecordOption {
  id: string;
  label: string;
  detail: string | null;
}

const DEBOUNCE_MS = 200;

/**
 * Picks one record with a server-side search (ARIA 1.2 editable combobox with a listbox popup).
 *
 * The selection only changes when an option is chosen or "Clear" is pressed; typing, leaving
 * the field or pressing Escape never clears it. The server always returns the selected record
 * among the options, so it can be seen and re-chosen however large the workspace is.
 */
export function RecordCombobox({
  id,
  name,
  label,
  initial,
  search,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  initial: RecordOption | null;
  search: (query: string, selectedId: string | null) => Promise<ActionResult<RecordOption[]>>;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<RecordOption | null>(initial);
  const [text, setText] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RecordOption[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While the field shows the current selection, list the first records instead of filtering.
  const query = selected && text === selected.label ? "" : text.trim();
  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await search(query, selectedId);
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setError(null);
        setOptions(result.data);
        const current = result.data.findIndex((option) => option.id === selectedId);
        setActive(current >= 0 ? current : result.data.length > 0 ? 0 : -1);
      } else {
        setError(result.error);
        setOptions([]);
        setActive(-1);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, selectedId, search]);

  function close() {
    setOpen(false);
    setText(selected?.label ?? "");
  }

  function choose(option: RecordOption) {
    setSelected(option);
    setText(option.label);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setText("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      if (!open) return;
      // Enter picks the highlighted option instead of submitting the form.
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
    }
  }

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId ?? ""} />
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={clear}
          >
            <X /> Clear
          </Button>
        ) : null}
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!open}
        className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
      >
        {options.map((option, index) => (
          <li
            key={option.id}
            id={optionId(index)}
            role="option"
            aria-selected={option.id === selectedId}
            className={cn(
              "flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5",
              index === active && "bg-muted",
              option.id === selectedId && "font-medium",
            )}
            // Keep focus in the input so blur does not close the list before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(option)}
          >
            <span className="truncate">{option.label}</span>
            {option.detail ? (
              <span className="truncate text-xs text-muted-foreground">{option.detail}</span>
            ) : null}
          </li>
        ))}
        {options.length === 0 ? (
          <li role="presentation" className="px-2 py-1.5 text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </span>
            ) : (
              (error ?? "No matches.")
            )}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
