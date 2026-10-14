import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { ContactForm } from "@/components/records/contact-form";
import { NotFoundError } from "@/server/errors";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { contactToInput, getContact } from "@/server/services/contacts";

import { loadContactFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  const { id } = await params;
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect(`/contacts/${id}`);
  const contact = await getContact(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const data = await loadContactFormData(ctx, contact.companyId);
  return (
    <>
      <PageHeader
        title={`Edit ${contact.firstName} ${contact.lastName}`}
        backHref={`/contacts/${id}`}
        backLabel="Back to contact"
      />
      <ContactForm {...data} contactId={id} values={contactToInput(contact)} />
    </>
  );
}
