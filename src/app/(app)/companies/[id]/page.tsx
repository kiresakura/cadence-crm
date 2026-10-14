import { Pencil, Plus } from "lucide-react";
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
import { COMPANY_SIZE_LABELS, formatCalendarDate, formatMoney, fullName } from "@/lib/format";
import { NotFoundError } from "@/server/errors";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { listTimeline } from "@/server/services/activities";
import { getCompany } from "@/server/services/companies";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { asJsonObject } from "@/server/services/guards";
import { memberOptions } from "@/server/services/members";
import { listTasksFor } from "@/server/services/tasks";

import { deleteCompanyAction } from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/companies/[id]">): Promise<Metadata> {
  const { ctx } = await requirePageContext();
  const company = await getCompany(ctx, (await params).id).catch(() => null);
  return { title: company?.name ?? "Company" };
}

export default async function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  const { ctx, user } = await requirePageContext();
  const company = await getCompany(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [timeline, tasks, fields, members] = await Promise.all([
    listTimeline(ctx, { companyId: id }),
    listTasksFor(ctx, { companyId: id }),
    listFieldDefinitions(ctx, "COMPANY"),
    memberOptions(ctx),
  ]);
  const canWrite = can(ctx.role, "records:write");

  return (
    <>
      <PageHeader
        backHref="/companies"
        backLabel="Companies"
        title={company.name}
        description={[company.industry, company.domain].filter(Boolean).join(" · ") || undefined}
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/companies/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <ConfirmDelete
                action={deleteCompanyAction.bind(null, id)}
                title={`Delete ${company.name}?`}
                description="Its contacts, deals, activities and tasks are kept but no longer linked to the company."
                redirectTo="/companies"
                successMessage="Company deleted"
              />
            </>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          <Section
            title={`People (${company.contacts.length})`}
            action={
              canWrite ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/contacts/new?companyId=${id}`}>
                    <Plus /> Add contact
                  </Link>
                </Button>
              ) : null
            }
          >
            {company.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts at this company yet.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {company.contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        {fullName(contact)}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {contact.jobTitle ?? contact.email ?? "—"}
                      </p>
                    </div>
                    <LifecycleBadge stage={contact.lifecycleStage} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {canWrite ? (
            <Section title="Log activity">
              <ActivityForm link={{ companyId: id }} />
            </Section>
          ) : null}
          <Section title="Timeline">
            <Timeline
              items={timeline}
              timeZone={user.timezone}
              canWrite={canWrite}
              hide="company"
            />
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Details">
            <DetailList
              items={[
                { label: "Domain", value: company.domain },
                { label: "Industry", value: company.industry },
                {
                  label: "Size",
                  value: company.size ? `${COMPANY_SIZE_LABELS[company.size]} employees` : null,
                },
                { label: "Phone", value: company.phone },
                { label: "Address", value: company.address },
                { label: "Owner", value: company.owner?.name ?? "Unassigned" },
                ...customFieldItems(fields, asJsonObject(company.customFields)),
              ]}
            />
            {company.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {company.tags.map(({ tag }) => (
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
                  <Link href={`/deals/new?companyId=${id}`}>New deal</Link>
                </Button>
              ) : null
            }
          >
            {company.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals yet.</p>
            ) : (
              <ul className="grid gap-3">
                {company.deals.map((deal) => (
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
                <NewTaskButton link={{ companyId: id }} members={members} currentUserId={user.id} />
              ) : null
            }
          >
            <TaskList tasks={toTaskRows(tasks, user.timezone)} canWrite={canWrite} />
          </Section>
        </div>
      </div>
    </>
  );
}
