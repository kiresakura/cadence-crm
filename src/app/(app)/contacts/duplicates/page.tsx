import { CopyCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyState, PageHeader } from "@/components/page";
import { formatDate } from "@/lib/format";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { findDuplicateGroups } from "@/server/services/duplicates";

import { MergeGroup } from "./merge-group";

export const metadata: Metadata = { title: "Duplicate contacts" };

export default async function DuplicatesPage() {
  const { ctx, user } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect("/contacts");
  const groups = await findDuplicateGroups(ctx);

  return (
    <>
      <PageHeader
        backHref="/contacts"
        backLabel="Contacts"
        title="Duplicate contacts"
        description="Contacts that share an email address or phone number. Merging moves activities, tasks, deals and tags to the record you keep."
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={CopyCheck}
          title="No duplicates found"
          description="Every contact has a unique email address and phone number."
        />
      ) : (
        <div className="grid gap-6">
          {groups.map((group) => (
            <MergeGroup
              key={group.contacts.map((contact) => contact.id).join()}
              reasons={group.reasons}
              contacts={group.contacts.map((contact) => ({
                id: contact.id,
                name: `${contact.firstName} ${contact.lastName}`,
                email: contact.email,
                phone: contact.phone,
                jobTitle: contact.jobTitle,
                company: contact.company?.name ?? null,
                created: formatDate(contact.createdAt, user.timezone),
                counts: contact._count,
              }))}
            />
          ))}
        </div>
      )}
    </>
  );
}
