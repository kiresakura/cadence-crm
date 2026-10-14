import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { CONTACT_IMPORT_FIELDS } from "@/server/domain/csv";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";

import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import contacts" };

export default async function ImportPage() {
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect("/contacts");
  return (
    <>
      <PageHeader
        backHref="/contacts"
        backLabel="Contacts"
        title="Import contacts"
        description="Upload a CSV file, check how its columns map to contact fields, preview the result and import. Rows whose email already exists are skipped."
      />
      <ImportWizard fields={CONTACT_IMPORT_FIELDS.map(({ key, label }) => ({ key, label }))} />
    </>
  );
}
