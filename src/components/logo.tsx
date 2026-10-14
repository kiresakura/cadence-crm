import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span
        aria-hidden
        className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M4 16 L9 11 L13 14 L20 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {compact ? null : <span>Cadence</span>}
    </span>
  );
}
