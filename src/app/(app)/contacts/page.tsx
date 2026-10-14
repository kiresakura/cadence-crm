import { Copy, Download, Plus, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LifecycleBadge, TagBadge, UserAvatar } from "@/components/badges";
import { EmptyState, PageHeader, Pagination } from "@/components/page";
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
import { formatDate, fullName, LIFECYCLE_LABELS } from "@/lib/format";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { listContacts, parseContactFilters } from "@/server/services/contacts";
import { memberOptions } from "@/server/services/members";
import { searchParamsToObject } from "@/server/services/query";
import { listTags } from "@/server/services/tags";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const { ctx, user } = await requirePageContext();
  const raw = searchParamsToObject(await searchParams);
  const filters = parseContactFilters(raw);
  const [page, members, tags] = await Promise.all([
    listContacts(ctx, filters),
    memberOptions(ctx),
    listTags(ctx),
  ]);
  const canWrite = can(ctx.role, "records:write");
  const exportQuery = new URLSearchParams(
    Object.entries(raw).filter(([key, value]) => key !== "page" && value),
  ).toString();
  const filtered = Boolean(filters.q || filters.owner || filters.lifecycle || filters.tag);

  return (
    <>
      <PageHeader
        title="Contacts"
        description="People you sell to, with their history in one place."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/export/contacts${exportQuery ? `?${exportQuery}` : ""}`}>
                <Download /> Export
              </a>
            </Button>
            {canWrite ? (
              <>
                <Button variant="outline" asChild>
                  <Link href="/contacts/duplicates">
                    <Copy /> Duplicates
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/contacts/import">
                    <Upload /> Import
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/contacts/new">
                    <Plus /> New contact
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <ListFilters
        action="/contacts"
        query={filters.q}
        searchPlaceholder="Search by name, email, phone or company"
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
            name: "lifecycle",
            label: "Lifecycle stage",
            value: filters.lifecycle,
            options: [
              { value: "", label: "Any stage" },
              ...Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({ value, label })),
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
              { value: "-created", label: "Newest first" },
              { value: "created", label: "Oldest first" },
              { value: "name", label: "Name A–Z" },
              { value: "-name", label: "Name Z–A" },
              { value: "-updated", label: "Recently updated" },
            ],
          },
        ]}
      />

      {page.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No contacts match these filters" : "No contacts yet"}
          description={
            filtered
              ? "Try a different search or clear the filters."
              : "Add your first contact or import a CSV file."
          }
          action={
            filtered ? (
              <Button variant="outline" asChild>
                <Link href="/contacts">Clear filters</Link>
              </Button>
            ) : canWrite ? (
              <Button asChild>
                <Link href="/contacts/new">
                  <Plus /> New contact
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
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead className="hidden xl:table-cell">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {fullName(contact)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {contact.email ?? contact.phone ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {contact.company ? (
                      <Link href={`/companies/${contact.company.id}`} className="hover:underline">
                        {contact.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LifecycleBadge stage={contact.lifecycleStage} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {contact.owner ? (
                      <span className="inline-flex items-center gap-1.5">
                        <UserAvatar name={contact.owner.name} /> {contact.owner.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.map(({ tag }) => (
                        <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {formatDate(contact.createdAt, user.timezone)}
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
        basePath="/contacts"
        searchParams={raw}
      />
    </>
  );
}
