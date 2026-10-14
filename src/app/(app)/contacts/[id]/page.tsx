import { Copy, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LifecycleBadge, StageBadge, TagBadge } from "@/components/badges";
import { DetailList, PageHeader, Section } from "@/components/page";
import { ConfirmDelete } from "@/components/records/confirm-delete";
import { customFieldItems } from "@/components/records/custom-fields";
import { toTaskRows } from "@/components/records/task-rows";
import { NewTaskButton, TaskList } from "@/components/records/tasks";
import { Timeline } from "@/components/records/timeline";
import { ActivityForm } from "@/components/records/timeline-client";
import { Button } from "@/components/ui/button";
import { formatCalendarDate, formatDate, formatMoney } from "@/lib/format";
import { NotFoundError } from "@/server/errors";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { listTimeline } from "@/server/services/activities";
import { getContact } from "@/server/services/contacts";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { findDuplicatesOf } from "@/server/services/duplicates";
import { memberOptions } from "@/server/services/members";
import { listTasksFor } from "@/server/services/tasks";
import { asJsonObject } from "@/server/services/guards";

import { deleteContactAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const { ctx } = await requirePageContext();
  const contact = await getContact(ctx, (await params).id).catch(() => null);
  return { title: contact ? `${contact.firstName} ${contact.lastName}` : "Contact" };
}

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  const { ctx, user } = await requirePageContext();
  const contact = await getContact(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [timeline, tasks, fields, duplicates, members] = await Promise.all([
    listTimeline(ctx, { contactId: id }),
    listTasksFor(ctx, { contactId: id }),
    listFieldDefinitions(ctx, "CONTACT"),
    findDuplicatesOf(ctx, id),
    memberOptions(ctx),
  ]);
  const canWrite = can(ctx.role, "records:write");
  const name = `${contact.firstName} ${contact.lastName}`;

  return (
    <>
      <PageHeader
        backHref="/contacts"
        backLabel="Contacts"
        title={name}
        description={
          [contact.jobTitle, contact.company?.name].filter(Boolean).join(" at ") || undefined
        }
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/contacts/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <ConfirmDelete
                action={deleteContactAction.bind(null, id)}
                title={`Delete ${name}?`}
                description="Their activities, tasks and deals stay in the workspace but lose this link. This cannot be undone."
                redirectTo="/contacts"
                successMessage="Contact deleted"
              />
            </>
          ) : null
        }
      />

      {duplicates.length > 0 && canWrite ? (
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950">
          <span className="flex items-center gap-2">
            <Copy className="size-4" />
            {duplicates.length === 1
              ? "1 possible duplicate shares this email or phone number."
              : `${duplicates.length} possible duplicates share this email or phone number.`}
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link href="/contacts/duplicates">Review and merge</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          {canWrite ? (
            <Section title="Log activity">
              <ActivityForm link={{ contactId: id, companyId: contact.companyId ?? undefined }} />
            </Section>
          ) : null}
          <Section title="Timeline">
            <Timeline
              items={timeline}
              timeZone={user.timezone}
              canWrite={canWrite}
              hide="contact"
            />
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Details">
            <DetailList
              items={[
                {
                  label: "Email",
                  value: contact.email ? (
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                      {contact.email}
                    </a>
                  ) : null,
                },
                { label: "Phone", value: contact.phone },
                {
                  label: "Company",
                  value: contact.company ? (
                    <Link
                      href={`/companies/${contact.company.id}`}
                      className="text-primary hover:underline"
                    >
                      {contact.company.name}
                    </Link>
                  ) : null,
                },
                { label: "Stage", value: <LifecycleBadge stage={contact.lifecycleStage} /> },
                { label: "Owner", value: contact.owner?.name ?? "Unassigned" },
                { label: "Source", value: contact.source },
                { label: "Added", value: formatDate(contact.createdAt, user.timezone) },
                ...customFieldItems(fields, asJsonObject(contact.customFields)),
              ]}
            />
            {contact.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {contact.tags.map(({ tag }) => (
                  <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            title="Deals"
            action={
              canWrite ? (
                <Button size="sm" variant="outline" asChild>
                  <Link
                    href={`/deals/new?contactId=${id}${contact.companyId ? `&companyId=${contact.companyId}` : ""}`}
                  >
                    New deal
                  </Link>
                </Button>
              ) : null
            }
          >
            {contact.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals with this contact yet.</p>
            ) : (
              <ul className="grid gap-3">
                {contact.deals.map((deal) => (
                  <li key={deal.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {deal.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(deal.amount.toString(), deal.currency)} · close{" "}
                        {formatCalendarDate(deal.expectedCloseDate)}
                      </p>
                    </div>
                    <StageBadge name={deal.stage.name} type={deal.stage.type} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Tasks"
            action={
              canWrite ? (
                <NewTaskButton link={{ contactId: id }} members={members} currentUserId={user.id} />
              ) : null
            }
          >
            <TaskList
              tasks={toTaskRows(tasks, user.timezone)}
              canWrite={canWrite}
              emptyTitle="No tasks"
            />
          </Section>
        </div>
      </div>
    </>
  );
}
