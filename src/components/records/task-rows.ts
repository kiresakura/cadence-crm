import { formatDateTime } from "@/lib/format";

import type { TaskRow } from "./tasks";

interface TaskWithRelations {
  id: string;
  title: string;
  priority: TaskRow["priority"];
  completedAt: Date | null;
  dueAt: Date | null;
  assignee: { name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  company: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}

/** Serialisable rows for the client task list, with dates formatted in the user's zone. */
export function toTaskRows(
  tasks: TaskWithRelations[],
  timeZone: string,
  now = new Date(),
): TaskRow[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    priority: task.priority,
    completed: task.completedAt !== null,
    dueLabel: task.dueAt ? formatDateTime(task.dueAt, timeZone) : null,
    overdue: task.dueAt !== null && task.dueAt.getTime() < now.getTime(),
    assigneeName: task.assignee?.name ?? null,
    related: task.deal
      ? { href: `/deals/${task.deal.id}`, label: task.deal.title }
      : task.contact
        ? {
            href: `/contacts/${task.contact.id}`,
            label: `${task.contact.firstName} ${task.contact.lastName}`,
          }
        : task.company
          ? { href: `/companies/${task.company.id}`, label: task.company.name }
          : null,
  }));
}
