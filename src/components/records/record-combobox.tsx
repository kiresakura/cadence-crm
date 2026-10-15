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
const SEARCH_FAILED = "Search failed. Press Enter to try again.";

/**
 * Picks one record with a server-side search (ARIA 1.2 editable combobox with a listbox popup).
 *
 * The selection only changes when an option is chosen or "Clear" is pressed; typing, leaving
 * the field or pressing Escape never clears it. While the field shows the selection, the server
 * returns the selected record among the options, so it can be seen and re-chosen however large
 * the workspace is; once other text is typed, it is listed only if it matches that text.
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
  // The query the shown options belong to; Enter only picks from results for the current text.
  const [optionsQuery, setOptionsQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to repeat a search that failed.
  const [attempt, setAttempt] = useState(0);

  // While the field shows the current selection, list the first records instead of filtering.
  const query = selected && text === selected.label ? "" : text.trim();
  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      // A request that never gets an answer (offline, server unreachable) ends the search too.
      const result = await search(query, selectedId).catch((): ActionResult<RecordOption[]> => ({
        ok: false,
        error: SEARCH_FAILED,
      }));
      if (cancelled) return;
      setLoading(false);
      setOptionsQuery(query);
      if (result.ok) {
        setError(null);
        setOptions(result.data);
        // Highlight the selection while the field shows it, otherwise the first match, so Enter
        // after typing picks what was typed rather than the current value.
        const current = query ? -1 : result.data.findIndex((option) => option.id === selectedId);
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
  }, [open, query, selectedId, search, attempt]);

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
      // Enter that confirms an input-method composition (Chinese, Japanese …) is not a choice.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (!open) return;
      // Enter picks the highlighted option instead of submitting the form, but only once the
      // results for the current text have arrived.
      event.preventDefault();
      if (loading || optionsQuery !== query) return;
      if (error) {
        setAttempt((count) => count + 1);
        return;
      }
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
  // Earlier results stay listed while newer ones load; say so instead of ignoring Enter silently.
  const refreshing = open && loading && options.length > 0;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId ?? ""} />
      <div className="flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
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
            className="pr-8"
          />
          {refreshing ? (
            <Loader2
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          ) : null}
        </div>
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
      <span role="status" className="sr-only">
        {open && loading ? "Searching…" : ""}
      </span>
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!open}
        aria-busy={loading || optionsQuery !== query}
        className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        // Keep focus in the input when the list (or its scrollbar) is pressed.
        onMouseDown={(event) => event.preventDefault()}
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
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(option)}
          >
            <span className="truncate">{option.label}</span>
            {option.detail ? (
              <span
                className={cn(
                  "truncate text-xs",
                  // Muted gray on the highlight's gray would fall below 4.5:1.
                  index === active ? "text-foreground/70" : "text-muted-foreground",
                )}
              >
                {option.detail}
              </span>
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
