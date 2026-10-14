"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { TagBadge } from "@/components/badges";
import { FormError, NativeSelect, SubmitButton } from "@/components/form";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

import { createTagAction, deleteTagAction, updateTagAction } from "../actions";

const COLORS = ["slate", "red", "amber", "green", "teal", "blue", "indigo", "pink"];

function ColorSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <NativeSelect
      name="color"
      defaultValue={defaultValue}
      aria-label="Color"
      className="w-28 capitalize"
    >
      {COLORS.map((color) => (
        <option key={color} value={color}>
          {color}
        </option>
      ))}
    </NativeSelect>
  );
}

function TagRow({ tag }: { tag: { id: string; name: string; color: string; usage: number } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useActionForm(updateTagAction.bind(null, tag.id), {
    successMessage: "Tag saved",
    onSuccess: () => router.refresh(),
  });
  return (
    <li className="py-2">
      <form onSubmit={form.onSubmit} className="flex flex-wrap items-center gap-2" noValidate>
        <span className="w-28">
          <TagBadge name={tag.name} color={tag.color} />
        </span>
        <Input name="name" defaultValue={tag.name} aria-label="Tag name" className="w-48" />
        <ColorSelect defaultValue={tag.color} />
        <span className="text-xs text-muted-foreground">Used {tag.usage}×</span>
        <SubmitButton pending={form.pending} variant="outline" size="sm">
          Save
        </SubmitButton>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete tag ${tag.name}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteTagAction(tag.id);
              if (result.ok) {
                toast.success("Tag deleted");
                router.refresh();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          <Trash2 />
        </Button>
      </form>
      <FormError message={form.formError} />
    </li>
  );
}

export function TagEditor({
  tags,
}: {
  tags: Array<{ id: string; name: string; color: string; usage: number }>;
}) {
  const router = useRouter();
  const add = useActionForm(createTagAction, {
    successMessage: "Tag created",
    onSuccess: (_data, form) => {
      form.reset();
      router.refresh();
    },
  });
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Tags</h2>
        <p className="text-xs text-muted-foreground">
          A shared vocabulary for labelling contacts and companies.
        </p>
      </div>
      <div className="px-4 py-2">
        {tags.length === 0 ? (
          <EmptyState title="No tags yet" className="my-2 py-6" />
        ) : (
          <ul className="divide-y">
            {tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} />
            ))}
          </ul>
        )}
        <form
          onSubmit={add.onSubmit}
          className="flex flex-wrap items-center gap-2 border-t py-3"
          noValidate
        >
          <Input name="name" placeholder="New tag" aria-label="New tag name" className="w-48" />
          <ColorSelect defaultValue="slate" />
          <SubmitButton pending={add.pending} size="sm">
            <Plus /> Add tag
          </SubmitButton>
        </form>
        <FormError message={add.formError} />
      </div>
    </section>
  );
}
