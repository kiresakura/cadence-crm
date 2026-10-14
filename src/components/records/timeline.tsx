import { CalendarClock, Mail, MessageSquareText, Phone } from "lucide-react";
import Link from "next/link";

import type { ActivityType } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/page";
import { ACTIVITY_LABELS, formatDateTime, fullName } from "@/lib/format";

import { DeleteActivityButton } from "./timeline-client";

const ICONS: Record<ActivityType, typeof Phone> = {
  NOTE: MessageSquareText,
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarClock,
};

export interface TimelineItem {
  id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  occurredAt: Date;
  author: { name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  company: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}

/** Activity history, newest first. Links to related records not shown on the current page. */
export function Timeline({
  items,
  timeZone,
  canWrite,
  hide,
}: {
  items: TimelineItem[];
  timeZone: string;
  canWrite: boolean;
  hide?: "contact" | "company" | "deal";
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No activity yet"
        description="Calls, emails, meetings and notes will show up here."
        className="py-8"
      />
    );
  }
  return (
    <ol className="relative grid gap-5 border-l pl-6">
      {items.map((item) => {
        const Icon = ICONS[item.type];
        return (
          <li key={item.id} className="relative">
            <span className="absolute top-0.5 -left-[2.1rem] flex size-6 items-center justify-center rounded-full border bg-background">
              <Icon className="size-3.5 text-muted-foreground" />
            </span>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {ACTIVITY_LABELS[item.type]} · {formatDateTime(item.occurredAt, timeZone)}
                  {item.author ? ` · ${item.author.name}` : ""}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
                  {item.contact && hide !== "contact" ? (
                    <Link
                      className="text-primary hover:underline"
                      href={`/contacts/${item.contact.id}`}
                    >
                      {fullName(item.contact)}
                    </Link>
                  ) : null}
                  {item.company && hide !== "company" ? (
                    <Link
                      className="text-primary hover:underline"
                      href={`/companies/${item.company.id}`}
                    >
                      {item.company.name}
                    </Link>
                  ) : null}
                  {item.deal && hide !== "deal" ? (
                    <Link className="text-primary hover:underline" href={`/deals/${item.deal.id}`}>
                      {item.deal.title}
                    </Link>
                  ) : null}
                </p>
                {item.body ? (
                  <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">
                    {item.body}
                  </p>
                ) : null}
              </div>
              {canWrite ? <DeleteActivityButton id={item.id} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
