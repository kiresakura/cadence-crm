import { Building2, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { TagBadge } from "@/components/badges";
import { EmptyState, PageHeader, pageHref, Pagination } from "@/components/page";
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
import { COMPANY_SIZE_LABELS } from "@/lib/format";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { listCompanies, parseCompanyFilters } from "@/server/services/companies";
import { memberOptions } from "@/server/services/members";
import { searchParamsToObject } from "@/server/services/query";
import { listTags } from "@/server/services/tags";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const { ctx, user } = await requirePageContext();
  const raw = searchParamsToObject(await searchParams);
  const filters = parseCompanyFilters(raw);
  const [page, members, tags] = await Promise.all([
    listCompanies(ctx, filters),
    memberOptions(ctx),
    listTags(ctx),
  ]);
  // A page number past the end (an old link, a deleted record) shows the last page instead.
  if (page.total > 0 && page.page > page.pageCount)
    redirect(pageHref("/companies", raw, page.pageCount));
  const canWrite = can(ctx.role, "records:write");
  const filtered = Boolean(filters.q || filters.owner || filters.tag);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Organisations you work with, their people and their deals."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/companies/new">
                <Plus /> New company
              </Link>
            </Button>
          ) : null
        }
      />
      <ListFilters
        action="/companies"
        query={filters.q}
        searchPlaceholder="Search by name, domain or industry"
        selects={[
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
            name: "tag",
            label: "Tag",
            value: filters.tag,
            options: [
              { value: "", label: "Any tag" },
              ...tags.map((t) => ({ value: t.id, label: t.name })),
            ],
          },
          {
            name: "sort",
            label: "Sort",
            value: filters.sort,
            options: [
              { value: "name", label: "Name A–Z" },
              { value: "-name", label: "Name Z–A" },
              { value: "-created", label: "Newest first" },
              { value: "created", label: "Oldest first" },
            ],
          },
        ]}
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? "No companies match these filters" : "No companies yet"}
          description={filtered ? "Try a different search." : "Add the organisations you sell to."}
          action={
            canWrite && !filtered ? (
              <Button asChild>
                <Link href="/companies/new">
                  <Plus /> New company
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Industry</TableHead>
                <TableHead className="hidden md:table-cell">Size</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {company.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{company.domain ?? "—"}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{company.industry ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {company.size ? COMPANY_SIZE_LABELS[company.size] : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {company._count.contacts}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{company._count.deals}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {company.owner?.name ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {company.tags.map(({ tag }) => (
                        <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </div>
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
        basePath="/companies"
        searchParams={raw}
      />
    </>
  );
}
