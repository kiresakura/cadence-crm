import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StageBadge } from "@/components/badges";
import { DetailList, PageHeader, Section } from "@/components/page";
import { ConfirmDelete } from "@/components/records/confirm-delete";
import { customFieldItems } from "@/components/records/custom-fields";
import { toTaskRows } from "@/components/records/task-rows";
import { NewTaskButton, TaskList } from "@/components/records/tasks";
import { Timeline } from "@/components/records/timeline";
import { ActivityForm } from "@/components/records/timeline-client";
import { Button } from "@/components/ui/button";
import {
  deletionNote,
  formatCalendarDate,
  formatDateTime,
  formatMoney,
  fullName,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotFoundError } from "@/server/errors";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { deletionImpact } from "@/server/services/deletion";
import { listTimeline } from "@/server/services/activities";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { getDeal } from "@/server/services/deals";
import { asJsonObject } from "@/server/services/guards";
import { memberOptions } from "@/server/services/members";
import { listTasksFor } from "@/server/services/tasks";

import { deleteDealAction } from "../actions";
import { CloseDealButtons } from "./close-buttons";

export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  const { ctx } = await requirePageContext();
  const deal = await getDeal(ctx, (await params).id).catch(() => null);
  return { title: deal?.title ?? "Deal" };
}

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const { ctx, user } = await requirePageContext();
  const deal = await getDeal(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [timeline, tasks, fields, members, impact] = await Promise.all([
    listTimeline(ctx, { dealId: id }),
    listTasksFor(ctx, { dealId: id }),
    listFieldDefinitions(ctx, "DEAL"),
    memberOptions(ctx),
    deletionImpact(ctx, "deal", id),
  ]);
  const canWrite = can(ctx.role, "records:write");
  const amount = formatMoney(deal.amount.toString(), deal.currency);
  const openStages = deal.pipeline.stages.filter((stage) => stage.type === "OPEN");

  return (
    <>
      <PageHeader
        backHref="/deals"
        backLabel="Deals"
        title={deal.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{amount}</span>
            <StageBadge name={deal.stage.name} type={deal.stage.type} />
            {deal.company ? (
              <Link href={`/companies/${deal.company.id}`} className="hover:underline">
                {deal.company.name}
              </Link>
            ) : null}
          </span>
        }
        actions={
          canWrite ? (
            <>
              <CloseDealButtons dealId={id} status={deal.stage.type} />
              <Button variant="outline" asChild>
                <Link href={`/deals/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <ConfirmDelete
                action={deleteDealAction.bind(null, id)}
                title={`Delete "${deal.title}"?`}
                description={deletionNote(impact, "deal")}
                redirectTo="/deals"
                successMessage="Deal deleted"
              />
            </>
          ) : null
        }
      />

      <ol
        className="mb-6 flex overflow-x-auto rounded-xl border bg-card text-xs"
        aria-label="Pipeline progress"
      >
        {openStages.map((stage) => {
          const reached =
            deal.stage.type === "WON" ||
            (deal.stage.type === "OPEN" && stage.position <= deal.stage.position);
          return (
            <li
              key={stage.id}
              aria-current={stage.id === deal.stageId ? "step" : undefined}
              className={cn(
                "flex-1 border-r px-3 py-2 text-center whitespace-nowrap last:border-r-0",
                reached ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {stage.name}
            </li>
          );
        })}
        <li
          className={cn(
            "flex-1 px-3 py-2 text-center font-medium whitespace-nowrap",
            deal.stage.type === "WON" &&
              "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
            deal.stage.type === "LOST" &&
              "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
            deal.stage.type === "OPEN" && "text-muted-foreground",
          )}
        >
          {deal.stage.type === "OPEN" ? "Won / Lost" : deal.stage.name}
        </li>
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          {canWrite ? (
            <Section title="Log activity">
              <ActivityForm
                link={{
                  dealId: id,
                  contactId: deal.primaryContactId ?? undefined,
                  companyId: deal.companyId ?? undefined,
                }}
              />
            </Section>
          ) : null}
          <Section title="Timeline">
            <Timeline items={timeline} timeZone={user.timezone} canWrite={canWrite} hide="deal" />
          </Section>
        </div>
        <div className="grid content-start gap-6">
          <Section title="Details">
            <DetailList
              items={[
                { label: "Amount", value: amount },
                { label: "Pipeline", value: deal.pipeline.name },
                { label: "Stage", value: `${deal.stage.name} (${deal.stage.probability}%)` },
                { label: "Expected close", value: formatCalendarDate(deal.expectedCloseDate) },
                ...(deal.closedAt
                  ? [{ label: "Closed", value: formatDateTime(deal.closedAt, user.timezone) }]
                  : []),
                ...(deal.lostReason ? [{ label: "Lost reason", value: deal.lostReason }] : []),
                {
                  label: "Contact",
                  value: deal.primaryContact ? (
                    <Link
                      href={`/contacts/${deal.primaryContact.id}`}
                      className="text-primary hover:underline"
                    >
                      {fullName(deal.primaryContact)}
                    </Link>
                  ) : null,
                },
                { label: "Owner", value: deal.owner?.name ?? "Unassigned" },
                ...customFieldItems(fields, asJsonObject(deal.customFields)),
              ]}
            />
          </Section>
          <Section
            title="Tasks"
            action={
              canWrite ? (
                <NewTaskButton link={{ dealId: id }} members={members} currentUserId={user.id} />
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
