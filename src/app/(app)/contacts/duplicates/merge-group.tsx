"use client";

import { GitMerge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { mergeDuplicateGroupAction } from "../actions";

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
  groupKey,
  contacts,
  reasons,
}: {
  groupKey: string;
  contacts: DuplicateContact[];
  reasons: Array<"email" | "phone">;
}) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(contacts[0]?.id ?? "");
  const [included, setIncluded] = useState(() => new Set(contacts.map((contact) => contact.id)));
  const [pending, startTransition] = useTransition();
  const mergeIds = contacts
    .filter((contact) => contact.id !== keepId && included.has(contact.id))
    .map((contact) => contact.id);

  function toggle(id: string, checked: boolean) {
    const next = new Set(included);
    if (checked) next.add(id);
    else next.delete(id);
    setIncluded(next);
    // The kept contact must stay in the merge; pick another one if it was left out.
    if (!checked && id === keepId) {
      setKeepId(contacts.find((contact) => next.has(contact.id))?.id ?? "");
    }
  }

  function merge() {
    startTransition(async () => {
      const result = await mergeDuplicateGroupAction({ key: groupKey, keepId, mergeIds });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Merged ${mergeIds.length} ${mergeIds.length === 1 ? "contact" : "contacts"}`);
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
        <Button size="sm" onClick={merge} disabled={pending || !keepId || mergeIds.length === 0}>
          <GitMerge /> Merge {mergeIds.length} into selected
        </Button>
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Untick anyone who is a different person. Values that differ from the contact you keep are
        listed in a note on it.
      </p>
      <fieldset className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <legend className="sr-only">Choose who to merge and the contact to keep</legend>
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className={cn(
              "rounded-lg border p-3 text-sm transition",
              keepId === contact.id && "border-primary bg-primary/5",
              !included.has(contact.id) && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={included.has(contact.id)}
                  onChange={(event) => toggle(contact.id, event.target.checked)}
                  className="accent-primary"
                  aria-label={`Include ${contact.name}`}
                />
                <span className="font-medium">{contact.name}</span>
              </label>
              <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="radio"
                  name={`keep-${groupKey}`}
                  value={contact.id}
                  checked={keepId === contact.id}
                  disabled={!included.has(contact.id)}
                  onChange={() => setKeepId(contact.id)}
                  className="accent-primary"
                  aria-label={`Keep ${contact.name}`}
                />
                Keep
              </label>
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
          </div>
        ))}
      </fieldset>
    </section>
  );
}
