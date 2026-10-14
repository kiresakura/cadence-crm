import { Download, KanbanSquare, List, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StageBadge } from "@/components/badges";
import { EmptyState, PageHeader, Pagination } from "@/components/page";
import { DealBoard } from "@/components/records/deal-board";
import { ListFilters } from "@/components/records/list-filters";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { getBoard, listDeals, parseDealFilters } from "@/server/services/deals";
import { memberOptions } from "@/server/services/members";
import { searchParamsToObject } from "@/server/services/query";

export const metadata: Metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const { ctx, user } = await requirePageContext();
  const raw = searchParamsToObject(await searchParams);
  const view = raw.view === "list" ? "list" : "board";
  const canWrite = can(ctx.role, "records:write");

  const toggle = (
    <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="View">
      {(
        [
          ["board", "Board", KanbanSquare],
          ["list", "List", List],
        ] as const
      ).map(([value, label, Icon]) => (
        <Link
          key={value}
          href={value === "board" ? "/deals" : "/deals?view=list"}
          aria-current={view === value ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted-foreground",
            view === value && "bg-muted font-medium text-foreground",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </div>
  );
  const newDeal = canWrite ? (
    <Button asChild>
      <Link href="/deals/new">
        <Plus /> New deal
      </Link>
    </Button>
  ) : null;

  if (view === "board") {
    const board = await getBoard(ctx, raw.pipeline);
    return (
      <>
        <PageHeader
          title="Deals"
          description="Drag deals between stages. Won and lost stages close the deal."
          actions={
            <>
              {toggle}
              {newDeal}
            </>
          }
        />
        {board.pipelines.length > 1 ? (
          <nav className="mb-4 flex flex-wrap gap-2" aria-label="Pipelines">
            {board.pipelines.map((pipeline) => (
              <Link
                key={pipeline.id}
                href={`/deals?pipeline=${pipeline.id}`}
                aria-current={pipeline.id === board.pipeline?.id ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  pipeline.id === board.pipeline?.id
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {pipeline.name}
              </Link>
            ))}
          </nav>
        ) : null}
        {board.pipeline ? (
          <DealBoard
            canWrite={canWrite}
            stages={board.stages.map(({ id, name, type, probability }) => ({
              id,
              name,
              type,
              probability,
            }))}
            deals={board.deals.map((deal) => ({
              id: deal.id,
              title: deal.title,
              amount: deal.amount.toFixed(2),
              currency: deal.currency,
              stageId: deal.stageId,
              companyName: deal.company?.name ?? null,
              contactName: deal.primaryContact
                ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`
                : null,
              ownerName: deal.owner?.name ?? null,
              expectedClose: deal.expectedCloseDate
                ? formatCalendarDate(deal.expectedCloseDate).replace(/, \d{4}$/, "")
                : null,
            }))}
          />
        ) : (
          <EmptyState icon={KanbanSquare} title="No pipelines yet" />
        )}
      </>
    );
  }

  const filters = parseDealFilters(raw);
  const [page, members] = await Promise.all([listDeals(ctx, filters), memberOptions(ctx)]);
  const exportQuery = new URLSearchParams(
    Object.entries(raw).filter(([key, value]) => !["page", "view"].includes(key) && value),
  ).toString();

  return (
    <>
      <PageHeader
        title="Deals"
        description="Every deal across your pipelines."
        actions={
          <>
            {toggle}
            <Button variant="outline" asChild>
              <a href={`/api/export/deals${exportQuery ? `?${exportQuery}` : ""}`}>
                <Download /> Export
              </a>
            </Button>
            {newDeal}
          </>
        }
      />
      <ListFilters
        action="/deals"
        query={filters.q}
        searchPlaceholder="Search by title or company"
        hidden={{ view: "list" }}
        selects={[
          {
            name: "status",
            label: "Status",
            value: filters.status,
            options: [
              { value: "", label: "Any status" },
              { value: "open", label: "Open" },
              { value: "won", label: "Won" },
              { value: "lost", label: "Lost" },
            ],
          },
          {
            name: "owner",
            label: "Owner",
            value: filters.owner,
            options: [
              { value: "", label: "Any owner" },
              { value: "me", label: "Owned by me" },
              { value: "none", label: "Unassigned" },
              ...members
                .filter((m) => m.id !== user.id)
                .map((m) => ({ value: m.id, label: m.label })),
            ],
          },
          {
            name: "sort",
            label: "Sort",
            value: filters.sort,
            options: [
              { value: "-created", label: "Newest first" },
              { value: "-amount", label: "Largest first" },
              { value: "amount", label: "Smallest first" },
              { value: "close", label: "Closing soonest" },
            ],
          },
        ]}
      />
      {page.items.length === 0 ? (
        <EmptyState icon={KanbanSquare} title="No deals match these filters" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="hidden md:table-cell">Expected close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell>
                    <Link
                      href={`/deals/${deal.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {deal.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[deal.company?.name, deal.pipeline.name].filter(Boolean).join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StageBadge name={deal.stage.name} type={deal.stage.type} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(deal.amount.toString(), deal.currency)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {deal.owner?.name ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatCalendarDate(deal.expectedCloseDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        basePath="/deals"
        searchParams={{ ...raw, view: "list" }}
      />
    </>
  );
}
