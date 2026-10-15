"use client";

import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fullName } from "@/lib/format";
import { IMPORT_ROW_LIMIT, IMPORT_SIZE_LIMIT, MAX_IMPORT_BYTES } from "@/lib/import-limits";

import { importContactsAction, previewImportAction } from "../actions";

type Mapping = Record<string, string | null>;
type Row =
  | {
      rowNumber: number;
      status: "ready";
      data: {
        firstName: string;
        lastName: string;
        email: string | null;
        companyName: string | null;
      };
    }
  | { rowNumber: number; status: "duplicate"; email: string; reason: string }
  | { rowNumber: number; status: "error"; messages: string[] };
interface Analysis {
  headers: string[];
  mapping: Mapping;
  rows: Row[];
  summary: { total: number; ready: number; duplicates: number; errors: number };
  unknownTags: string[];
}

const SAMPLE = `First name,Last name,Email,Phone,Company,Lifecycle stage,Tags
Avery,Stone,avery.stone@example.com,+1 555 0100,Larkspur & Vane Supply,prospect,
Jordan,Lee,jordan.lee@example.com,,Moonquill Studio,lead,`;

export function ImportWizard({ fields }: { fields: Array<{ key: string; label: string }> }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [result, setResult] = useState<{ created: number; summary: Analysis["summary"] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Problems are shown next to the file picker; whatever was previewed before stays on screen.
  function fail(message: string) {
    setError(message);
    toast.error(message);
  }

  function upload(chosen: File, mapping?: Mapping) {
    const formData = new FormData();
    formData.set("file", chosen);
    if (mapping) formData.set("mapping", JSON.stringify(mapping));
    return formData;
  }

  function preview(chosen: File, mapping?: Mapping) {
    startTransition(async () => {
      try {
        const response = await previewImportAction(upload(chosen, mapping));
        if (response.ok) {
          setError(null);
          setFileName(chosen.name);
          setFile(chosen);
          setResult(null);
          setAnalysis(response.data as Analysis);
        } else {
          fail(response.error);
        }
      } catch {
        fail("The file could not be uploaded. Check that it is a CSV file under 2 MB.");
      }
    });
  }

  function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Clearing the input lets the same file be chosen again after fixing it.
    input.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      fail(`"${file.name}" is larger than ${IMPORT_SIZE_LIMIT}. Split it into smaller files.`);
      return;
    }
    preview(file);
  }

  function changeMapping(header: string, field: string) {
    if (!analysis || !file) return;
    const mapping = { ...analysis.mapping, [header]: field || null };
    preview(file, mapping);
  }

  function runImport() {
    if (!analysis || !file) return;
    startTransition(async () => {
      try {
        const response = await importContactsAction(upload(file, analysis.mapping));
        if (response.ok) {
          setError(null);
          setResult({ created: response.data.created, summary: response.data.summary });
          setAnalysis(response.data as Analysis);
          toast.success(`Imported ${response.data.created} contacts`);
        } else {
          fail(response.error);
        }
      } catch {
        fail("The import could not be sent. Check that the file is under 2 MB and try again.");
      }
    });
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">1. Choose a CSV file</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          UTF-8, up to {IMPORT_SIZE_LIMIT} and {IMPORT_ROW_LIMIT}. The first row must contain column
          names.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <FileUp className="size-4" />
            {fileName ?? "Select file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="CSV file"
              onChange={(event) => onFile(event.currentTarget)}
            />
          </label>
          <a
            className="text-sm text-primary hover:underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`}
            download="contacts-sample.csv"
          >
            Download a sample file
          </a>
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            data-testid="import-error"
          >
            {error}
          </p>
        ) : null}
      </section>

      {analysis ? (
        <>
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">2. Map columns</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analysis.headers.map((header) => (
                <label key={header} className="grid gap-1 text-sm">
                  <span className="font-medium">{header}</span>
                  <NativeSelect
                    value={analysis.mapping[header] ?? ""}
                    onChange={(event) => changeMapping(header, event.target.value)}
                    disabled={pending}
                  >
                    <option value="">Do not import</option>
                    {fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">3. Preview</h2>
                <p className="mt-1 flex flex-wrap gap-2 text-sm">
                  <Badge>{analysis.summary.ready} ready</Badge>
                  <Badge variant="secondary">
                    {analysis.summary.duplicates} duplicates skipped
                  </Badge>
                  <Badge variant="destructive">{analysis.summary.errors} with errors</Badge>
                </p>
                {analysis.unknownTags.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Unknown tags are ignored: {analysis.unknownTags.join(", ")}
                  </p>
                ) : null}
              </div>
              {result ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4" /> {result.created} contacts imported
                  </span>
                  <Button asChild variant="outline">
                    <Link href="/contacts">View contacts</Link>
                  </Button>
                </div>
              ) : (
                <Button onClick={runImport} disabled={pending || analysis.summary.ready === 0}>
                  Import {analysis.summary.ready} contacts
                </Button>
              )}
            </div>
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.rows.slice(0, 200).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.status === "ready" ? (
                          <Badge>Ready</Badge>
                        ) : row.status === "duplicate" ? (
                          <Badge variant="secondary">Duplicate</Badge>
                        ) : (
                          <Badge variant="destructive">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {row.status === "ready"
                          ? `${fullName(row.data)}${row.data.email ? ` · ${row.data.email}` : ""}${row.data.companyName ? ` · ${row.data.companyName}` : ""}`
                          : row.status === "duplicate"
                            ? `${row.email} — ${row.reason}`
                            : row.messages.join(" ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {analysis.rows.length > 200 ? (
              <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 rows.</p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
