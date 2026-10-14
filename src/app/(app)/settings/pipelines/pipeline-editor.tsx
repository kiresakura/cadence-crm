"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { FormError, NativeSelect, SubmitButton } from "@/components/form";
import { ConfirmDelete } from "@/components/records/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StageType } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { useActionForm } from "@/lib/use-action-form";

import {
  addStageAction,
  createPipelineAction,
  deletePipelineAction,
  deleteStageAction,
  renamePipelineAction,
  shiftStageAction,
  updateStageAction,
} from "../actions";

interface StageView {
  id: string;
  name: string;
  probability: number;
  type: StageType;
  deals: number;
}

function useRefreshingCall() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const call = (fn: () => Promise<ActionResult<unknown>>, message: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  return { pending, call };
}

function StageTypeSelect({ defaultValue }: { defaultValue: StageType }) {
  return (
    <NativeSelect name="type" defaultValue={defaultValue} aria-label="Stage type" className="w-28">
      <option value="OPEN">Open</option>
      <option value="WON">Won</option>
      <option value="LOST">Lost</option>
    </NativeSelect>
  );
}

function StageRow({ stage, first, last }: { stage: StageView; first: boolean; last: boolean }) {
  const router = useRouter();
  const { pending, call } = useRefreshingCall();
  const form = useActionForm(updateStageAction.bind(null, stage.id), {
    successMessage: "Stage saved",
    onSuccess: () => router.refresh(),
  });
  return (
    <li className="grid gap-2 py-2">
      <form onSubmit={form.onSubmit} className="flex flex-wrap items-center gap-2" noValidate>
        <div className="flex flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={first || pending}
            aria-label={`Move ${stage.name} up`}
            onClick={() => call(() => shiftStageAction(stage.id, "up"), "Order saved")}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={last || pending}
            aria-label={`Move ${stage.name} down`}
            onClick={() => call(() => shiftStageAction(stage.id, "down"), "Order saved")}
          >
            <ArrowDown />
          </Button>
        </div>
        <Input
          name="name"
          defaultValue={stage.name}
          aria-label="Stage name"
          className="w-44 flex-1"
        />
        <div className="flex items-center gap-1">
          <Input
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={stage.probability}
            aria-label="Win probability (%)"
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <StageTypeSelect defaultValue={stage.type} />
        <span className="w-16 text-xs text-muted-foreground">
          {stage.deals} {stage.deals === 1 ? "deal" : "deals"}
        </span>
        <SubmitButton pending={form.pending} variant="outline" size="sm">
          Save
        </SubmitButton>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending || stage.deals > 0}
          aria-label={`Delete ${stage.name}`}
          title={stage.deals > 0 ? "Move this stage's deals first" : undefined}
          onClick={() => call(() => deleteStageAction(stage.id), "Stage deleted")}
        >
          <Trash2 />
        </Button>
      </form>
      <FormError message={form.formError} />
    </li>
  );
}

export function PipelineEditor({
  pipeline,
  canDelete,
}: {
  pipeline: { id: string; name: string; stages: StageView[] };
  canDelete: boolean;
}) {
  const router = useRouter();
  const rename = useActionForm(renamePipelineAction.bind(null, pipeline.id), {
    successMessage: "Pipeline renamed",
    onSuccess: () => router.refresh(),
  });
  const add = useActionForm(addStageAction.bind(null, pipeline.id), {
    successMessage: "Stage added",
    onSuccess: (_data, form) => {
      form.reset();
      router.refresh();
    },
  });
  const hasDeals = pipeline.stages.some((stage) => stage.deals > 0);

  return (
    <section className="rounded-xl border bg-card" aria-label={`${pipeline.name} pipeline`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <form onSubmit={rename.onSubmit} className="flex items-center gap-2" noValidate>
          <Input
            name="name"
            defaultValue={pipeline.name}
            aria-label="Pipeline name"
            className="w-56 font-medium"
          />
          <SubmitButton pending={rename.pending} variant="outline" size="sm">
            Rename
          </SubmitButton>
        </form>
        {canDelete && !hasDeals ? (
          <ConfirmDelete
            action={deletePipelineAction.bind(null, pipeline.id)}
            title={`Delete the ${pipeline.name} pipeline?`}
            description="Its stages are deleted too. This cannot be undone."
            successMessage="Pipeline deleted"
          />
        ) : null}
      </div>
      <div className="px-4 py-2">
        <ol className="divide-y">
          {pipeline.stages.map((stage, index) => (
            <StageRow
              key={stage.id}
              stage={stage}
              first={index === 0}
              last={index === pipeline.stages.length - 1}
            />
          ))}
        </ol>
        <form
          onSubmit={add.onSubmit}
          className="flex flex-wrap items-center gap-2 border-t py-3"
          noValidate
        >
          <Input
            name="name"
            placeholder="New stage name"
            aria-label="New stage name"
            className="w-44 flex-1"
          />
          <Input
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={50}
            aria-label="New stage win probability (%)"
            className="w-20"
          />
          <StageTypeSelect defaultValue="OPEN" />
          <SubmitButton pending={add.pending} size="sm">
            <Plus /> Add stage
          </SubmitButton>
        </form>
        <FormError message={add.formError} />
      </div>
    </section>
  );
}

export function NewPipelineForm() {
  const router = useRouter();
  const { onSubmit, pending, formError } = useActionForm(createPipelineAction, {
    successMessage: "Pipeline created",
    onSuccess: (_data, form) => {
      form.reset();
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded-xl border border-dashed p-4" noValidate>
      <p className="text-sm font-medium">Add a pipeline</p>
      <p className="text-xs text-muted-foreground">New pipelines start with the default stages.</p>
      <div className="flex gap-2">
        <Input
          name="name"
          placeholder="e.g. Partnerships"
          aria-label="Pipeline name"
          className="max-w-xs"
        />
        <SubmitButton pending={pending}>Create pipeline</SubmitButton>
      </div>
      <FormError message={formError} />
    </form>
  );
}
