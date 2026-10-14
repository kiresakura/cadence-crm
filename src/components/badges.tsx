import type { LifecycleStage, StageType, TaskPriority } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { LIFECYCLE_LABELS, PRIORITY_LABELS, TAG_COLOR_CLASSES, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        TAG_COLOR_CLASSES[color] ?? TAG_COLOR_CLASSES.slate,
      )}
    >
      {name}
    </span>
  );
}

const LIFECYCLE_CLASSES: Record<LifecycleStage, string> = {
  LEAD: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  PROSPECT: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
  CUSTOMER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  CHURNED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        LIFECYCLE_CLASSES[stage],
      )}
    >
      {LIFECYCLE_LABELS[stage]}
    </span>
  );
}

export function StageBadge({ name, type }: { name: string; type: StageType }) {
  const variant = type === "WON" ? "default" : type === "LOST" ? "destructive" : "secondary";
  return <Badge variant={variant}>{name}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "text-xs font-medium",
        priority === "HIGH" && "text-red-600 dark:text-red-400",
        priority === "MEDIUM" && "text-amber-600 dark:text-amber-400",
        priority === "LOW" && "text-muted-foreground",
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.65rem] font-semibold text-primary",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
