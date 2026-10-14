import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { ContactForm } from "@/components/records/contact-form";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";

import { loadContactFormData } from "../form-data";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage({ searchParams }: PageProps<"/contacts/new">) {
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect("/contacts");
  const params = await searchParams;
  const data = await loadContactFormData(
    ctx,
    typeof params.companyId === "string" ? params.companyId : null,
  );
  // Only a company from this workspace is pre-filled.
  const companyId = data.company?.id ?? null;
  return (
    <>
      <PageHeader title="New contact" backHref="/contacts" backLabel="Contacts" />
      <ContactForm
        {...data}
        values={
          companyId
            ? {
                firstName: "",
                lastName: "",
                email: null,
                phone: null,
                jobTitle: null,
                companyId,
                ownerId: ctx.userId,
                lifecycleStage: "LEAD",
                source: null,
                tagIds: [],
                customFields: {},
              }
            : undefined
        }
      />
    </>
  );
}
