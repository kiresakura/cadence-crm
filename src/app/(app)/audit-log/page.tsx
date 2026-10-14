import { History, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { EmptyState, PageHeader, pageHref, Pagination } from "@/components/page";
import { ListFilters } from "@/components/records/list-filters";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import {
  AUDIT_ENTITY_FILTERS,
  listAuditLogs,
  parseAuditFilters,
} from "@/server/services/audit-log";
import { searchParamsToObject } from "@/server/services/query";

export const metadata: Metadata = { title: "Audit log" };

function describe(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  return Object.entries(changes as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, value]) => {
      if (value && typeof value === "object" && "from" in value && "to" in value) {
        const change = value as { from: unknown; to: unknown };
        return `${key}: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join("; ");
}

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const { ctx, user } = await requirePageContext();
  if (!can(ctx.role, "audit:read")) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="The audit log is limited to admins"
        description="Ask a workspace owner or admin for access."
      />
    );
  }
  const raw = searchParamsToObject(await searchParams);
  const filters = parseAuditFilters(raw);
  const page = await listAuditLogs(ctx, filters);
  // A page number past the end (an old link, a deleted record) shows the last page instead.
  if (page.total > 0 && page.page > page.pageCount)
    redirect(pageHref("/audit-log", raw, page.pageCount));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made in this workspace, newest first."
      />
      <ListFilters
        action="/audit-log"
        search={false}
        selects={[
          {
            name: "entity",
            label: "Record type",
            value: filters.entity,
            options: [
              { value: "", label: "All records" },
              ...AUDIT_ENTITY_FILTERS.map((entity) => ({
                value: entity,
                label: entity.replace("_", " "),
              })),
            ],
          },
        ]}
      />
      {page.items.length === 0 ? (
        <EmptyState icon={History} title="Nothing recorded yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(entry.createdAt, user.timezone)}
                  </TableCell>
                  <TableCell>{entry.actor?.name ?? "Deleted user"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-md truncate text-xs text-muted-foreground md:table-cell">
                    <details>
                      <summary className="cursor-pointer truncate">
                        {describe(entry.changes) || "—"}
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">
                        {JSON.stringify(entry.changes, null, 2)}
                      </pre>
                    </details>
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
        basePath="/audit-log"
        searchParams={raw}
      />
    </>
  );
}
