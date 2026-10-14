"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTaskAction, saveTaskAction, toggleTaskAction } from "@/app/(app)/record-actions";
import { PriorityBadge } from "@/components/badges";
import { Field, FormError, NativeSelect, SubmitButton, errorProps } from "@/components/form";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TaskPriority } from "@/generated/prisma/enums";
import { useActionForm } from "@/lib/use-action-form";
import { cn } from "@/lib/utils";

export interface TaskRow {
  id: string;
  title: string;
  priority: TaskPriority;
  completed: boolean;
  dueLabel: string | null;
  overdue: boolean;
  assigneeName: string | null;
  related: { href: string; label: string } | null;
}

export function TaskList({
  tasks,
  canWrite,
  emptyTitle = "No tasks",
  emptyDescription,
}: {
  tasks: TaskRow[];
  canWrite: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    tasks,
    (state, update: { id: string; completed: boolean }) =>
      state.map((task) =>
        task.id === update.id ? { ...task, completed: update.completed } : task,
      ),
  );

  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className="py-8" />;
  }

  function toggle(task: TaskRow, completed: boolean) {
    startTransition(async () => {
      setOptimistic({ id: task.id, completed });
      const result = await toggleTaskAction(task.id, completed);
      if (result.ok) {
        toast.success(completed ? "Task completed" : "Task reopened");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(task: TaskRow) {
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.ok) {
        toast.success("Task deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <ul className="divide-y rounded-lg border">
      {optimistic.map((task) => (
        <li key={task.id} className="flex items-start gap-3 px-3 py-2.5">
          <Checkbox
            className="mt-0.5"
            checked={task.completed}
            disabled={!canWrite}
            onCheckedChange={(value) => toggle(task, value === true)}
            aria-label={
              task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`
            }
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-medium",
                task.completed && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <PriorityBadge priority={task.priority} />
              {task.dueLabel ? (
                <span
                  className={cn(task.overdue && !task.completed && "font-medium text-destructive")}
                >
                  {task.overdue && !task.completed ? "Overdue · " : "Due "}
                  {task.dueLabel}
                </span>
              ) : (
                <span>No due date</span>
              )}
              {task.assigneeName ? <span>· {task.assigneeName}</span> : null}
              {task.related ? (
                <Link className="text-primary hover:underline" href={task.related.href}>
                  {task.related.label}
                </Link>
              ) : null}
            </p>
          </div>
          {canWrite ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete task "${task.title}"`}
              onClick={() => remove(task)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function NewTaskButton({
  link,
  members,
  currentUserId,
  size = "sm",
}: {
  link?: { contactId?: string; companyId?: string; dealId?: string };
  members: Array<{ id: string; label: string }>;
  currentUserId: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, formError, errorFor } = useActionForm(saveTaskAction, {
    successMessage: "Task created",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={size === "sm" ? "outline" : "default"}>
          <Plus /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Tasks are assigned to you unless you pick someone else.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormError message={formError} />
          {Object.entries(link ?? {}).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <Field label="Title" htmlFor="task-title" error={errorFor("title")} required>
            <Input id="task-title" name="title" {...errorProps("task-title", errorFor("title"))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due" htmlFor="task-due" error={errorFor("dueAt")}>
              <Input id="task-due" name="dueAt" type="datetime-local" />
            </Field>
            <Field label="Priority" htmlFor="task-priority">
              <NativeSelect id="task-priority" name="priority" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Assignee" htmlFor="task-assignee" error={errorFor("assigneeId")}>
            <NativeSelect id="task-assignee" name="assigneeId" defaultValue={currentUserId}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SubmitButton pending={pending}>Create task</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
