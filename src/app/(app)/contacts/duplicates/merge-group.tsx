"use client";

import { GitMerge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { mergeContactsAction } from "../actions";

interface DuplicateContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  company: string | null;
  created: string;
  counts: { activities: number; tasks: number; deals: number };
}

export function MergeGroup({
  contacts,
  reasons,
}: {
  contacts: DuplicateContact[];
  reasons: Array<"email" | "phone">;
}) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(contacts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const others = contacts.filter((contact) => contact.id !== keepId);

  function merge() {
    startTransition(async () => {
      for (const other of others) {
        const result = await mergeContactsAction(keepId, other.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }
      toast.success(`Merged ${others.length} ${others.length === 1 ? "contact" : "contacts"}`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border bg-card" aria-label="Duplicate group">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Matched by</span>
          {reasons.map((reason) => (
            <Badge key={reason} variant="secondary">
              same {reason}
            </Badge>
          ))}
        </div>
        <Button size="sm" onClick={merge} disabled={pending || others.length === 0}>
          <GitMerge /> Merge into selected
        </Button>
      </div>
      <fieldset className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <legend className="sr-only">Choose the contact to keep</legend>
        {contacts.map((contact) => (
          <label
            key={contact.id}
            className={cn(
              "cursor-pointer rounded-lg border p-3 text-sm transition has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            )}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name={`keep-${contacts[0]?.id}`}
                value={contact.id}
                checked={keepId === contact.id}
                onChange={() => setKeepId(contact.id)}
                className="accent-primary"
              />
              <span className="font-medium">{contact.name}</span>
              {keepId === contact.id ? <Badge>Keep</Badge> : null}
            </div>
            <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <div>{contact.email ?? "No email"}</div>
              <div>{contact.phone ?? "No phone"}</div>
              <div>{[contact.jobTitle, contact.company].filter(Boolean).join(" at ") || "—"}</div>
              <div>
                Added {contact.created} · {contact.counts.activities} activities ·{" "}
                {contact.counts.tasks} tasks · {contact.counts.deals} deals
              </div>
            </dl>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
