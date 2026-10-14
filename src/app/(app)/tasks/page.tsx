import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page";
import { toTaskRows } from "@/components/records/task-rows";
import { NewTaskButton, TaskList } from "@/components/records/tasks";
import { cn } from "@/lib/utils";
import { TASK_VIEWS, taskWindows, type TaskView } from "@/server/domain/tasks";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { memberOptions } from "@/server/services/members";
import { listMyTasks } from "@/server/services/tasks";

export const metadata: Metadata = { title: "Tasks" };

const LABELS: Record<TaskView, string> = {
  mine: "All open",
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Next 7 days",
  completed: "Completed",
};

const EMPTY: Record<TaskView, string> = {
  mine: "Nothing on your plate. Nice.",
  overdue: "No overdue tasks.",
  today: "Nothing due today.",
  upcoming: "Nothing due in the next seven days.",
  completed: "No completed tasks yet.",
};

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { ctx, user } = await requirePageContext();
  const params = await searchParams;
  const view = (TASK_VIEWS as readonly string[]).includes(String(params.view))
    ? (params.view as TaskView)
    : "mine";
  const now = new Date();
  const [{ items, counts }, members] = await Promise.all([
    listMyTasks(ctx, view, taskWindows(now, user.timezone)),
    memberOptions(ctx),
  ]);
  const canWrite = can(ctx.role, "records:write");
  const countFor: Partial<Record<TaskView, number>> = counts;

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Follow-ups assigned to you, in your time zone."
        actions={
          canWrite ? (
            <NewTaskButton members={members} currentUserId={user.id} size="default" />
          ) : null
        }
      />
      <nav className="mb-4 flex flex-wrap gap-1 border-b" aria-label="Task views">
        {TASK_VIEWS.map((option) => (
          <Link
            key={option}
            href={option === "mine" ? "/tasks" : `/tasks?view=${option}`}
            aria-current={option === view ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
              option === view && "border-primary font-medium text-foreground",
            )}
          >
            {LABELS[option]}
            {countFor[option] !== undefined ? (
              <span
                className={cn(
                  "rounded-full bg-muted px-1.5 text-xs tabular-nums",
                  option === "overdue" &&
                    (countFor.overdue ?? 0) > 0 &&
                    "bg-destructive/10 text-red-700 dark:text-red-200",
                )}
              >
                {countFor[option]}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <TaskList
        tasks={toTaskRows(items, user.timezone, now)}
        canWrite={canWrite}
        emptyTitle={EMPTY[view]}
      />
    </>
  );
}
